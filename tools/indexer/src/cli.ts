// Rebuilds the Azure AI Search index from the SharePoint libraries (operator command).
// Reads documents with the operator's delegated Graph token, so it never sees more than user A can.
// Prints counts only: no document text, no identifiers.
import { readFileSync } from "node:fs";
import { AzureCliCredential } from "@azure/identity";
import { signIn } from "@kb/test-support/auth";
import { loadE2eConfig, tokenCacheFile } from "@kb/test-support/e2e-config";
import { aclGroupsFor, validateIndexerConfig, type IndexerConfig } from "./acl.js";
import { buildChunks, type IndexedDocument } from "./chunks.js";
import { createEmbedder } from "@kb/llm-providers";
import { readLibraries } from "./graph.js";
import { batch, reconcile } from "./reconcile.js";
import { createSearchIndexClient } from "./search-client.js";

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
  const graphToken = await signIn(
    { ...e2e, apiScope: "https://graph.microsoft.com/.default" },
    e2e.userA,
    tokenCacheFile("indexer"),
  );

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

  console.log(
    `Indexed ${documents.length} documents, ${chunks.length} chunks; ` +
      `${plan.delete.length} stale chunks deleted, ${skipped} files skipped.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
