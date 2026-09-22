import { describe, expect, it, vi } from "vitest";
import { isUpstreamError } from "@kb/core";
import { AiSearchRetriever } from "./ai-search-retriever.js";

const SITE = "https://contoso.sharepoint.com/sites/kb-demo";

const hit = (id: string, docId: string, score: number, section = "Auxílio") => ({
  "@search.score": score,
  id,
  docId,
  title: "politica-home-office",
  url: `${SITE}/Politicas/politica-home-office.docx`,
  library: "Politicas",
  section,
  content: "A empresa paga auxílio home office de R$ 150,00 por mês.",
  aclGroups: ["group-colaboradores"],
});

function setup(
  hits: ReturnType<typeof hit>[] = [hit("c1", "doc-1", 0.9)],
  overrides: { groups?: string[]; fetchFn?: typeof fetch } = {},
) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const fetchFn =
    overrides.fetchFn ??
    (((url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return Promise.resolve(
        new Response(JSON.stringify({ value: hits }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch);

  const retriever = new AiSearchRetriever({
    endpoint: "https://srch.search.windows.net",
    indexName: "kb-chunks-dev",
    getToken: () => Promise.resolve("search-token"),
    embed: (inputs) => Promise.resolve(inputs.map(() => [0.1, 0.2, 0.3])),
    groupsFor: () => Promise.resolve(overrides.groups ?? ["group-colaboradores", "group-rh"]),
    fetchFn,
  });
  return { retriever, requests };
}

describe("AiSearchRetriever", () => {
  it("runs a hybrid query filtered by the caller's groups", async () => {
    const { retriever, requests } = setup();

    const result = await retriever.retrieve({
      question: "Qual o auxílio?",
      graphToken: "graph-token",
    });

    const body = requests[0]?.body as Record<string, unknown>;
    expect(requests[0]?.url).toContain("/indexes/kb-chunks-dev/docs/search");
    expect(body.search).toBe("Qual o auxílio?");
    expect(body.filter).toBe("aclGroups/any(g: search.in(g, 'group-colaboradores,group-rh'))");
    expect(body.vectorQueries).toEqual([
      { kind: "vector", vector: [0.1, 0.2, 0.3], fields: "contentVector", k: expect.any(Number) },
    ]);
    expect(body.select).toBe("id,docId,title,url,library,section,content");
    expect(result.chunks[0]).toMatchObject({
      id: "c1",
      docId: "doc-1",
      title: "politica-home-office",
      text: "Auxílio\nA empresa paga auxílio home office de R$ 150,00 por mês.",
    });
  });

  it("ranks documents by their best chunk and reports each document once", async () => {
    const { retriever } = setup([
      hit("c1", "doc-1", 0.4),
      hit("c2", "doc-2", 0.9, "Regras"),
      hit("c3", "doc-2", 0.5, "Outra"),
    ]);

    const result = await retriever.retrieve({ question: "q", graphToken: "graph-token" });

    expect(result.documents.map((document) => [document.docId, document.rank])).toEqual([
      ["doc-2", 1],
      ["doc-1", 2],
    ]);
    expect(result.documentCount).toBe(2);
    expect(result.chunks).toHaveLength(3);
  });

  it("returns nothing, without querying, when the caller belongs to no group", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const { retriever } = setup([], { groups: [], fetchFn });

    await expect(retriever.retrieve({ question: "q", graphToken: "t" })).resolves.toEqual({
      chunks: [],
      documentCount: 0,
      documents: [],
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps a search failure to an upstream error", async () => {
    const fetchFn = (() =>
      Promise.resolve(new Response("{}", { status: 500 }))) as unknown as typeof fetch;
    const { retriever } = setup([], { fetchFn });

    await expect(retriever.retrieve({ question: "q", graphToken: "t" })).rejects.toSatisfy(
      (error: unknown) => isUpstreamError(error) && error.kind === "upstream",
    );
  });

  it("maps an embedding failure to an upstream error before searching", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const retriever = new AiSearchRetriever({
      endpoint: "https://srch.search.windows.net",
      indexName: "kb-chunks-dev",
      getToken: () => Promise.resolve("search-token"),
      embed: () => Promise.reject(new Error("embeddings down")),
      groupsFor: () => Promise.resolve(["group-a"]),
      fetchFn,
    });

    await expect(retriever.retrieve({ question: "q", graphToken: "t" })).rejects.toSatisfy(
      (error: unknown) => isUpstreamError(error) && error.kind === "upstream",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
