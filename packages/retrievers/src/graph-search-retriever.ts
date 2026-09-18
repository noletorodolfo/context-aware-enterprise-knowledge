import { UpstreamError, withSpan, type Chunk, type RetrievedDocument } from "@kb/core";
import { extractSections, type Section } from "./docx-sections.js";
import {
  DEFAULT_LIMITS,
  selectChunks,
  type CandidateSection,
  type SelectionLimits,
} from "./select.js";
import { buildSearchQuery, extractKeywords } from "./text.js";

export interface RetrievalResult {
  chunks: Chunk[];
  /** In-scope documents considered (top N), including ones skipped for size or access. */
  documentCount: number;
  /** Documents actually read, with their rank among the in-scope search hits. */
  documents: RetrievedDocument[];
}

export interface Retriever {
  retrieve(input: { question: string; graphToken: string }): Promise<RetrievalResult>;
}

export interface GraphSearchRetrieverOptions {
  /** Only documents under these site URLs are ever used. */
  siteUrls: string[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxDocuments?: number;
  maxFileBytes?: number;
  limits?: SelectionLimits;
}

interface DriveItemHit {
  resource?: {
    id?: string;
    name?: string;
    webUrl?: string;
    size?: number;
    parentReference?: { driveId?: string };
  };
}

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * Retrieval with the caller's delegated Graph token: SharePoint trims results and downloads to
 * what that user can open. Out-of-scope hits are discarded even if Graph returns them.
 */
export class GraphSearchRetriever implements Retriever {
  private readonly options: Required<Omit<GraphSearchRetrieverOptions, "fetchFn">> & {
    fetchFn: typeof fetch;
  };

  public constructor(options: GraphSearchRetrieverOptions) {
    this.options = {
      siteUrls: options.siteUrls.map((url) => url.replace(/\/+$/, "").toLowerCase()),
      fetchFn: options.fetchFn ?? fetch,
      timeoutMs: options.timeoutMs ?? 10_000,
      maxDocuments: options.maxDocuments ?? 3,
      maxFileBytes: options.maxFileBytes ?? 2 * 1024 * 1024,
      limits: options.limits ?? DEFAULT_LIMITS,
    };
  }

  public async retrieve({
    question,
    graphToken,
  }: {
    question: string;
    graphToken: string;
  }): Promise<RetrievalResult> {
    const keywords = extractKeywords(question);
    if (keywords.length === 0) return { chunks: [], documentCount: 0, documents: [] };

    const documents = await withSpan(
      "graph.search",
      { "kb.keywords.count": keywords.length },
      async (span) => {
        const hits = await this.search(
          buildSearchQuery(keywords, this.options.siteUrls),
          graphToken,
        );
        const inScope = hits
          .map((hit) => hit.resource)
          .filter(
            (r): r is Required<NonNullable<DriveItemHit["resource"]>> =>
              !!r?.id &&
              !!r.webUrl &&
              !!r.parentReference?.driveId &&
              (r.name ?? "").toLowerCase().endsWith(".docx") &&
              this.inScope(r.webUrl),
          )
          .slice(0, this.options.maxDocuments);
        span.setAttribute("kb.search.hits", hits.length);
        span.setAttribute("kb.documents.count", inScope.length);
        return inScope;
      },
    );

    const candidates: CandidateSection[] = [];
    const readable: RetrievedDocument[] = [];
    for (const [index, doc] of documents.entries()) {
      if (!Number.isFinite(doc.size) || (doc.size ?? 0) > this.options.maxFileBytes) continue;
      const sections = await this.download(doc.parentReference.driveId ?? "", doc.id, graphToken);
      const title = doc.name.replace(/\.docx$/i, "");
      if (sections.length > 0) {
        readable.push({ docId: doc.id, title, url: doc.webUrl, rank: index + 1 });
      }
      sections.forEach((section, sectionIndex) =>
        candidates.push({
          docId: doc.id,
          title,
          url: doc.webUrl,
          sectionIndex,
          heading: section.heading,
          text: section.text,
        }),
      );
    }

    const chunks = await withSpan(
      "retrieval.select",
      { "kb.candidates.count": candidates.length },
      async (span) => {
        const selected = selectChunks(keywords, candidates, this.options.limits);
        span.setAttribute("kb.chunks.count", selected.length);
        return selected;
      },
    );

    return {
      chunks,
      documentCount: documents.length,
      documents: readable,
    };
  }

  private inScope(webUrl: string): boolean {
    const url = webUrl.toLowerCase();
    return this.options.siteUrls.some((site) => url.startsWith(`${site}/`));
  }

  private async request(
    url: string,
    init: RequestInit,
    stage: "search" | "download",
  ): Promise<Response> {
    try {
      return await this.options.fetchFn(url, {
        ...init,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new UpstreamError("upstream", "Microsoft Graph request failed", {
        stage,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  private async search(queryString: string, graphToken: string): Promise<DriveItemHit[]> {
    const response = await this.request(
      `${GRAPH}/search/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{ entityTypes: ["driveItem"], query: { queryString }, from: 0, size: 10 }],
        }),
      },
      "search",
    );
    if (!response.ok)
      throw new UpstreamError("upstream", `Graph search failed: ${response.status}`, {
        status: response.status,
        stage: "search",
      });
    let json: { value?: { hitsContainers?: { hits?: DriveItemHit[] }[] }[] };
    try {
      json = (await response.json()) as {
        value?: { hitsContainers?: { hits?: DriveItemHit[] }[] }[];
      };
    } catch (error) {
      throw new UpstreamError("upstream", "Microsoft Graph search failed", {
        stage: "search",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return json.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
  }

  private download(driveId: string, itemId: string, graphToken: string): Promise<Section[]> {
    return withSpan("graph.download", {}, async (span) => {
      const sections = await this.downloadSections(driveId, itemId, graphToken, (status) =>
        span.setAttribute("http.response.status_code", status),
      );
      span.setAttribute("kb.sections.count", sections.length);
      return sections;
    });
  }

  private async downloadSections(
    driveId: string,
    itemId: string,
    graphToken: string,
    onStatus: (status: number) => void,
  ): Promise<Section[]> {
    const response = await this.request(
      `${GRAPH}/drives/${driveId}/items/${itemId}/content`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${graphToken}` },
      },
      "download",
    );
    onStatus(response.status);
    if (response.status === 403 || response.status === 404) return [];
    if (!response.ok)
      throw new UpstreamError("upstream", `Graph download failed: ${response.status}`, {
        status: response.status,
        stage: "download",
      });
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new UpstreamError("upstream", "Microsoft Graph download failed", {
        stage: "download",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    try {
      return await extractSections(buffer);
    } catch {
      return [];
    }
  }
}
