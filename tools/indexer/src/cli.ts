// Rebuilds the Azure AI Search index from the SharePoint libraries (operator command).
// With --reset-delta it also clears the ingestion delta cursors, so the event-driven path and the
// index describe the same moment instead of resuming from a token taken before the rebuild.
// Reads documents with the operator's delegated Graph token, so it never sees more than user A can.
// Prints counts only: no document text, no identifiers.
import { readFileSync } from "node:fs";
import { AzureCliCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { signIn } from "@kb/test-support/auth";
import { loadE2eConfig, tokenCacheFile } from "@kb/test-support/e2e-config";
import { createEmbedder } from "@kb/llm-providers";
import {
  aclGroupsFor,
  batch,
  buildChunks,
  createSearchIndexClient,
  readLibraries,
  reconcile,
  validateIndexerConfig,
  type IndexedDocument,
  type IndexerConfig,
} from "@kb/ingestion";

const EMBEDDING_BATCH = 16;
const UPLOAD_BATCH = 100;

function loadConfig(): IndexerConfig {
  const path = new URL("../indexer.config.json", import.meta.url);
  try {
    return validateIndexerConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message.includes("indexer.config.json")) throw error;
    throw new Error(
      "Missing tools/indexer/indexer.config.json. Copy indexer.config.example.json and fill in real values.",
      { cause: error },
    );
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const credential = new AzureCliCredential();

  console.log("Signing in as test user A (cached tokens are reused)...");
  const e2e = loadE2eConfig();
  const graphToken = await signIn(e2e, e2e.userA, tokenCacheFile("indexer"), [
    "https://graph.microsoft.com/Sites.Read.All",
    "https://graph.microsoft.com/Files.Read.All",
  ]);

  const { files, skipped } = await readLibraries(
    config.siteUrl,
    Object.keys(config.libraries),
    graphToken,
  );
  const documents: IndexedDocument[] = files.map((file) => ({
    ...file,
    aclGroups: aclGroupsFor(file.library, config),
  }));
  const chunks = buildChunks(documents);

  const embed = createEmbedder({
    endpoint: config.openAiEndpoint,
    deployment: config.embeddingDeployment,
    credential,
  });
  const vectors: number[][] = [];
  for (const group of batch(chunks, EMBEDDING_BATCH)) {
    vectors.push(...(await embed(group.map((chunk) => chunk.embeddingInput))));
  }

  const client = createSearchIndexClient({
    endpoint: config.searchEndpoint,
    indexName: config.indexName,
    credential,
  });
  await client.createOrUpdateIndex();

  const existing = await client.listChunkIds();
  const plan = reconcile(
    existing,
    chunks.map((chunk) => chunk.id),
  );

  const documentsToUpload = chunks.map(({ embeddingInput: _embeddingInput, ...chunk }, index) => ({
    ...chunk,
    contentVector: vectors[index] ?? [],
  }));
  for (const group of batch(documentsToUpload, UPLOAD_BATCH)) await client.upload(group);
  for (const group of batch(plan.delete, UPLOAD_BATCH)) await client.remove(group);

  const cleared = process.argv.includes("--reset-delta")
    ? await resetDeltaTokens(config, credential)
    : null;

  console.log(
    `Indexed ${documents.length} documents, ${chunks.length} chunks; ` +
      `${plan.delete.length} stale chunks deleted, ${skipped} files skipped.` +
      (cleared === null ? "" : ` ${cleared} delta cursors cleared.`),
  );
}

/**
 * Clears the stored delta tokens. The next notification then does one full pass per drive, which is
 * wasteful but never wrong; leaving an older token is also correct, because applying a change twice
 * writes the same rows. Resetting is about the two halves of the derived state agreeing.
 */
async function resetDeltaTokens(
  config: IndexerConfig,
  credential: AzureCliCredential,
): Promise<number> {
  if (!config.stateAccountUrl) {
    throw new Error("indexer.config.json: --reset-delta needs stateAccountUrl");
  }
  const container = new BlobServiceClient(config.stateAccountUrl, credential).getContainerClient(
    "ingestion-state",
  );
  if (!(await container.exists())) return 0;
  let cleared = 0;
  for await (const blob of container.listBlobsFlat({ prefix: "delta/" })) {
    await container.getBlockBlobClient(blob.name).deleteIfExists();
    cleared += 1;
  }
  return cleared;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
