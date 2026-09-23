import { buildChunks, type IndexedDocument, type SearchChunk } from "./chunks.js";
import type { DeltaChange } from "./delta.js";
import { batch, reconcile } from "./reconcile.js";
import type { SearchIndexClient } from "./search-client.js";

const EMBEDDING_BATCH = 16;
const UPLOAD_BATCH = 100;

export interface ApplyDeps {
  search: SearchIndexClient;
  embed: (inputs: string[]) => Promise<number[][]>;
  /** Entra group ids allowed to read this library; must fail rather than guess. */
  aclGroupsFor: (library: string) => string[];
}

export interface ApplyResult {
  documentsIndexed: number;
  chunksUploaded: number;
  chunksDeleted: number;
  documentsRemoved: number;
}

/**
 * Applies a set of delta changes to the index, one document at a time.
 *
 * Idempotent by construction: a chunk's key is derived from the document id and the section index,
 * so re-processing the same change replaces the same rows. Sections that disappeared because the
 * document got shorter are deleted by comparing the document's stored chunk ids with the ones it
 * has now, which is also how a removed document is cleaned up.
 */
export async function applyChanges(changes: DeltaChange[], deps: ApplyDeps): Promise<ApplyResult> {
  const result: ApplyResult = {
    documentsIndexed: 0,
    chunksUploaded: 0,
    chunksDeleted: 0,
    documentsRemoved: 0,
  };

  for (const change of changes) {
    const existing = await deps.search.listChunkIdsForDocument(change.docId);

    if (change.removed || !change.file) {
      if (existing.length > 0) {
        await deps.search.remove(existing);
        result.chunksDeleted += existing.length;
      }
      result.documentsRemoved += 1;
      continue;
    }

    const document: IndexedDocument = {
      ...change.file,
      aclGroups: deps.aclGroupsFor(change.file.library),
    };
    const chunks = buildChunks([document]);
    const { delete: stale } = reconcile(
      existing,
      chunks.map((chunk) => chunk.id),
    );

    await uploadChunks(chunks, deps);
    if (stale.length > 0) await deps.search.remove(stale);

    result.documentsIndexed += 1;
    result.chunksUploaded += chunks.length;
    result.chunksDeleted += stale.length;
  }

  return result;
}

async function uploadChunks(chunks: SearchChunk[], deps: ApplyDeps): Promise<void> {
  const vectors: number[][] = [];
  for (const group of batch(chunks, EMBEDDING_BATCH)) {
    vectors.push(...(await deps.embed(group.map((chunk) => chunk.embeddingInput))));
  }
  const documents = chunks.map(({ embeddingInput: _embeddingInput, ...chunk }, index) => {
    const contentVector = vectors[index];
    if (!contentVector) throw new Error(`missing embedding for chunk ${chunk.id}`);
    return { ...chunk, contentVector };
  });
  for (const group of batch(documents, UPLOAD_BATCH)) {
    await deps.search.upload(group);
  }
}
