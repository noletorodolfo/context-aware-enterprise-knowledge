import { UpstreamError, withSpan, type Chunk, type RetrievedDocument } from "@kb/core";
import type { Embedder } from "@kb/llm-providers";
import type { GroupResolver } from "./group-membership.js";
import type { Retriever, RetrievalResult } from "./graph-search-retriever.js";
import { DEFAULT_LIMITS, type SelectionLimits } from "./select.js";

const API_VERSION = "2024-07-01";
const SELECT = "id,docId,title,url,library,section,content";

export interface AiSearchRetrieverOptions {
  endpoint: string;
  indexName: string;
  /** Returns a bearer token for the Azure AI Search data plane. */
  getToken: () => Promise<string>;
  embed: Embedder;
  groupsFor: GroupResolver;
  limits?: SelectionLimits;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface SearchHit {
  "@search.score"?: number;
  id?: string;
  docId?: string;
  title?: string;
  url?: string;
  section?: string;
  content?: string;
}

/**
 * Hybrid retrieval (BM25 + vector) over the project's own index. Unlike Graph Search, the index has
 * no notion of the caller, so every query carries a filter built from the caller's Entra groups.
 */
export class AiSearchRetriever implements Retriever {
  private readonly options: AiSearchRetrieverOptions;

  public constructor(options: AiSearchRetrieverOptions) {
    this.options = options;
  }

  public retrieve({
    question,
    graphToken,
  }: {
    question: string;
    graphToken: string;
  }): Promise<RetrievalResult> {
    return withSpan("search.query", {}, async (span) => {
      const groups = await this.options.groupsFor(graphToken);
      span.setAttribute("kb.acl.groups.count", groups.length);
      if (groups.length === 0) return { chunks: [], documentCount: 0, documents: [] };

      const limits = this.options.limits ?? DEFAULT_LIMITS;
      const vector = await this.embed(question);
      const hits = await this.search(question, vector, groups, limits.maxSections);
      span.setAttribute("kb.search.hits", hits.length);

      const chunks: Chunk[] = [];
      const best = new Map<string, number>();
      for (const hit of hits) {
        if (!hit.id || !hit.docId || !hit.content) continue;
        const score = hit["@search.score"] ?? 0;
        best.set(hit.docId, Math.max(best.get(hit.docId) ?? 0, score));
        chunks.push({
          id: hit.id,
          docId: hit.docId,
          title: hit.title ?? "",
          url: hit.url ?? "",
          text: hit.section ? `${hit.section}\n${hit.content}` : hit.content,
          score,
        });
      }

      const documents: RetrievedDocument[] = [...best.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([docId], index) => {
          const chunk = chunks.find((candidate) => candidate.docId === docId);
          return { docId, title: chunk?.title ?? "", url: chunk?.url ?? "", rank: index + 1 };
        });

      span.setAttribute("kb.chunks.count", chunks.length);
      span.setAttribute("kb.documents.count", documents.length);
      return { chunks, documentCount: documents.length, documents };
    });
  }

  private async embed(question: string): Promise<number[]> {
    try {
      const [vector] = await this.options.embed([question]);
      if (!vector) throw new Error("no embedding returned");
      return vector;
    } catch (error) {
      throw new UpstreamError("upstream", "Embedding request failed", {
        stage: "embedding",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  private async search(
    question: string,
    vector: number[],
    groups: string[],
    top: number,
  ): Promise<SearchHit[]> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const endpoint = this.options.endpoint.replace(/\/+$/, "");
    const url = `${endpoint}/indexes/${this.options.indexName}/docs/search?api-version=${API_VERSION}`;
    // Group ids are opaque GUIDs from the caller's token; they never come from request input.
    const filter = `aclGroups/any(g: search.in(g, '${groups.join(",")}'))`;

    let response: Response;
    try {
      const token = await this.options.getToken();
      response = await fetchFn(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          search: question,
          filter,
          select: SELECT,
          top,
          vectorQueries: [{ kind: "vector", vector, fields: "contentVector", k: top }],
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new UpstreamError("upstream", "Azure AI Search request failed", {
        stage: "search",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    if (!response.ok) {
      throw new UpstreamError("upstream", `Azure AI Search failed: ${response.status}`, {
        stage: "search",
        status: response.status,
      });
    }
    try {
      const json = (await response.json()) as { value?: SearchHit[] };
      return json.value ?? [];
    } catch (error) {
      throw new UpstreamError("upstream", "Azure AI Search returned invalid JSON", {
        stage: "search",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
