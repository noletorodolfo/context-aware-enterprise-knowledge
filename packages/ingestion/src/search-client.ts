import type { TokenCredential } from "@azure/identity";
import type { SearchChunk } from "./chunks.js";

const API_VERSION = "2024-07-01";
const SEARCH_SCOPE = "https://search.azure.com/.default";
export const VECTOR_DIMENSIONS = 1536;

export interface SearchClientOptions {
  endpoint: string;
  indexName: string;
  credential: TokenCredential;
  fetchFn?: typeof fetch;
}

/** Index of permission-tagged chunks: BM25 over Portuguese text plus an HNSW vector field. */
export function indexDefinition(indexName: string): Record<string, unknown> {
  const text = (name: string, searchable: boolean) => ({
    name,
    type: "Edm.String",
    searchable,
    filterable: !searchable,
    retrievable: true,
    ...(searchable ? { analyzer: "pt-Br.microsoft" } : {}),
  });

  return {
    name: indexName,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true, retrievable: true },
      text("docId", false),
      text("library", false),
      { ...text("title", true), filterable: false },
      { ...text("section", true), filterable: false },
      { ...text("content", true), filterable: false },
      { name: "url", type: "Edm.String", retrievable: true, searchable: false, filterable: false },
      {
        name: "aclGroups",
        type: "Collection(Edm.String)",
        filterable: true,
        retrievable: true,
        searchable: false,
      },
      {
        name: "contentVector",
        type: "Collection(Edm.Single)",
        searchable: true,
        retrievable: false,
        dimensions: VECTOR_DIMENSIONS,
        vectorSearchProfile: "chunk-profile",
      },
    ],
    vectorSearch: {
      algorithms: [{ name: "chunk-hnsw", kind: "hnsw", hnswParameters: { metric: "cosine" } }],
      profiles: [{ name: "chunk-profile", algorithm: "chunk-hnsw" }],
    },
  };
}

export interface SearchIndexClient {
  createOrUpdateIndex(): Promise<void>;
  listChunkIds(): Promise<string[]>;
  /** Chunk ids currently stored for one document, so a single change can be reconciled alone. */
  listChunkIdsForDocument(docId: string): Promise<string[]>;
  upload(
    chunks: (Omit<SearchChunk, "embeddingInput"> & { contentVector: number[] })[],
  ): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

/** Thin REST client: the project talks to Azure services with fetch and Entra ID tokens, no SDK. */
export function createSearchIndexClient(options: SearchClientOptions): SearchIndexClient {
  const fetchFn = options.fetchFn ?? fetch;
  const base = options.endpoint.replace(/\/+$/, "");

  const request = async (path: string, init: RequestInit): Promise<Response> => {
    const token = await options.credential.getToken(SEARCH_SCOPE);
    if (!token) throw new Error("Could not acquire a token for Azure AI Search");
    const response = await fetchFn(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Azure AI Search ${init.method ?? "GET"} ${path} failed: ${response.status}`);
    }
    return response;
  };

  return {
    createOrUpdateIndex: async () => {
      await request(`/indexes/${options.indexName}?api-version=${API_VERSION}`, {
        method: "PUT",
        body: JSON.stringify(indexDefinition(options.indexName)),
      });
    },

    listChunkIds: async () => {
      const ids: string[] = [];
      let skip = 0;
      for (;;) {
        const response = await request(
          `/indexes/${options.indexName}/docs/search?api-version=${API_VERSION}`,
          { method: "POST", body: JSON.stringify({ search: "*", select: "id", top: 1000, skip }) },
        );
        const page = (await response.json()) as { value?: { id: string }[] };
        const values = page.value ?? [];
        ids.push(...values.map((item) => item.id));
        if (values.length < 1000) return ids;
        skip += values.length;
      }
    },

    listChunkIdsForDocument: async (docId) => {
      const response = await request(
        `/indexes/${options.indexName}/docs/search?api-version=${API_VERSION}`,
        {
          method: "POST",
          body: JSON.stringify({
            search: "*",
            // A document id is an opaque Graph id; filtering on it never needs full-text semantics.
            filter: `docId eq '${docId.replace(/'/g, "''")}'`,
            select: "id",
            top: 1000,
          }),
        },
      );
      const page = (await response.json()) as { value?: { id: string }[] };
      return (page.value ?? []).map((item) => item.id);
    },

    upload: async (chunks) => {
      if (chunks.length === 0) return;
      await request(`/indexes/${options.indexName}/docs/index?api-version=${API_VERSION}`, {
        method: "POST",
        body: JSON.stringify({
          value: chunks.map((chunk) => ({ "@search.action": "mergeOrUpload", ...chunk })),
        }),
      });
    },

    remove: async (ids) => {
      if (ids.length === 0) return;
      await request(`/indexes/${options.indexName}/docs/index?api-version=${API_VERSION}`, {
        method: "POST",
        body: JSON.stringify({ value: ids.map((id) => ({ "@search.action": "delete", id })) }),
      });
    },
  };
}
