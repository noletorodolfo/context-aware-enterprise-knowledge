import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { GraphSearchRetriever } from "./graph-search-retriever.js";

const SITE = "https://contoso.sharepoint.com/sites/kb-demo";

const hit = (id: string, name: string, webUrl: string, size = 1000) => ({
  hitId: id,
  resource: {
    "@odata.type": "#microsoft.graph.driveItem",
    id,
    name,
    webUrl,
    size,
    parentReference: { driveId: `drive-${id}` },
  },
});

async function docx(heading: string, body: string): Promise<ArrayBuffer> {
  const buffer = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: body }),
          ],
        },
      ],
    }),
  );
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

interface Route {
  search?: { status: number; json?: unknown };
  files?: Record<string, { status: number; body?: ArrayBuffer }>;
  throws?: Error;
}

function fakeGraph(route: Route) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    requests.push({ url, init });
    if (route.throws) return Promise.reject(route.throws);
    if (url === "https://graph.microsoft.com/v1.0/search/query") {
      const s = route.search ?? { status: 200, json: { value: [] } };
      return Promise.resolve(new Response(JSON.stringify(s.json ?? {}), { status: s.status }));
    }
    const file = Object.entries(route.files ?? {}).find(([id]) =>
      url.includes(`/items/${id}/content`),
    );
    if (!file) return Promise.resolve(new Response("", { status: 404 }));
    return Promise.resolve(new Response(file[1].body ?? null, { status: file[1].status }));
  }) as unknown as typeof fetch;
  return { requests, fetchFn };
}

const searchResult = (hits: unknown[]) => ({ value: [{ hitsContainers: [{ hits }] }] });

describe("GraphSearchRetriever", () => {
  it("searches with the user's token and the site scope, downloads in-scope .docx and selects sections", async () => {
    const { requests, fetchFn } = fakeGraph({
      search: {
        status: 200,
        json: searchResult([
          hit("a", "politica-home-office.docx", `${SITE}/Politicas/politica-home-office.docx`),
          hit("x", "segredo.docx", "https://contoso.sharepoint.com/sites/other/Docs/segredo.docx"),
          hit("p", "Home.aspx", `${SITE}/SitePages/Home.aspx`),
        ]),
      },
      files: {
        a: { status: 200, body: await docx("Auxílio", "Auxílio home office de R$ 150,00.") },
      },
    });

    const result = await new GraphSearchRetriever({ siteUrls: [SITE], fetchFn }).retrieve({
      question: "Qual o valor do auxílio home office?",
      graphToken: "graph-token",
    });

    const search = requests[0];
    expect(search?.url).toBe("https://graph.microsoft.com/v1.0/search/query");
    expect((search?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer graph-token",
    );
    const body = JSON.parse(String(search?.init?.body));
    expect(body.requests[0].entityTypes).toEqual(["driveItem"]);
    expect(body.requests[0].query.queryString).toContain(`path:"${SITE}"`);
    expect(requests.map((r) => r.url)).toEqual([
      "https://graph.microsoft.com/v1.0/search/query",
      "https://graph.microsoft.com/v1.0/drives/drive-a/items/a/content",
    ]);
    expect(result.documentCount).toBe(1);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      id: "a#0",
      title: "politica-home-office",
      url: `${SITE}/Politicas/politica-home-office.docx`,
      text: "Auxílio\nAuxílio home office de R$ 150,00.",
    });
  });

  it("keeps only the top 3 documents and skips files over 2 MB and forbidden downloads", async () => {
    const body = await docx("Auxílio", "auxílio");
    const { requests, fetchFn } = fakeGraph({
      search: {
        status: 200,
        json: searchResult([
          hit("big", "big.docx", `${SITE}/D/big.docx`, 3_000_000),
          hit("forbidden", "f.docx", `${SITE}/D/f.docx`),
          hit("ok", "ok.docx", `${SITE}/D/ok.docx`),
          hit("fourth", "fourth.docx", `${SITE}/D/fourth.docx`),
        ]),
      },
      files: {
        forbidden: { status: 403 },
        ok: { status: 200, body },
        fourth: { status: 200, body },
      },
    });

    const result = await new GraphSearchRetriever({ siteUrls: [SITE], fetchFn }).retrieve({
      question: "auxílio",
      graphToken: "t",
    });

    const downloads = requests.slice(1).map((r) => r.url);
    expect(downloads).toEqual([
      "https://graph.microsoft.com/v1.0/drives/drive-forbidden/items/forbidden/content",
      "https://graph.microsoft.com/v1.0/drives/drive-ok/items/ok/content",
    ]);
    expect(result.documentCount).toBe(3);
    expect(result.chunks.map((c) => c.docId)).toEqual(["ok"]);
  });

  it("does not call Graph when the question has no keywords", async () => {
    const { requests, fetchFn } = fakeGraph({});
    const result = await new GraphSearchRetriever({ siteUrls: [SITE], fetchFn }).retrieve({
      question: "o que é?",
      graphToken: "t",
    });
    expect(requests).toHaveLength(0);
    expect(result).toEqual({ chunks: [], documentCount: 0 });
  });

  it.each([
    ["search error", { search: { status: 500, json: {} } }],
    ["network failure or timeout", { throws: new DOMException("timeout", "TimeoutError") }],
  ])("maps %s to an upstream error", async (_label, route) => {
    const { fetchFn } = fakeGraph(route as Route);
    await expect(
      new GraphSearchRetriever({ siteUrls: [SITE], fetchFn }).retrieve({
        question: "auxílio",
        graphToken: "t",
      }),
    ).rejects.toMatchObject({ name: "UpstreamError", kind: "upstream" });
  });
});
