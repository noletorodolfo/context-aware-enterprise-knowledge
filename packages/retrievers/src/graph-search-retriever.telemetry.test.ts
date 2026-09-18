import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { beforeAll, describe, expect, it } from "vitest";
import {
  allAttributeValues,
  installTestTelemetry,
  type TestTelemetry,
} from "@kb/test-support/otel";
import { GraphSearchRetriever } from "./graph-search-retriever.js";

const SITE = "https://contoso.sharepoint.com/sites/kb-demo";

const hit = (id: string) => ({
  resource: {
    id,
    name: `${id}.docx`,
    webUrl: `${SITE}/Docs/${id}.docx`,
    size: 1000,
    parentReference: { driveId: `drive-${id}` },
  },
});

async function docx(): Promise<Uint8Array> {
  const buffer = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "Auxílio", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "Auxílio home office de R$ 150,00." }),
          ],
        },
      ],
    }),
  );
  return new Uint8Array(buffer);
}

describe("GraphSearchRetriever telemetry", () => {
  let telemetry: TestTelemetry;
  beforeAll(() => {
    telemetry = installTestTelemetry();
  });

  it("creates graph.search, one graph.download per document and retrieval.select", async () => {
    const readable = await docx();
    const fetchFn = ((url: string) => {
      if (url.endsWith("/search/query"))
        return Promise.resolve(
          new Response(
            JSON.stringify({ value: [{ hitsContainers: [{ hits: [hit("a"), hit("b")] }] }] }),
            { status: 200 },
          ),
        );
      if (url.includes("/items/a/")) return Promise.resolve(new Response(readable));
      return Promise.resolve(new Response("", { status: 403 }));
    }) as unknown as typeof fetch;

    const result = await new GraphSearchRetriever({ siteUrls: [SITE], fetchFn }).retrieve({
      question: "Qual o valor do auxílio home office?",
      graphToken: "graph-token",
    });
    expect(result.chunks).toHaveLength(1);

    expect(telemetry.span("graph.search").attributes).toMatchObject({
      "kb.search.hits": 2,
      "kb.documents.count": 2,
    });
    const downloads = telemetry.spans().filter((span) => span.name === "graph.download");
    expect(downloads.map((span) => span.attributes)).toEqual([
      { "http.response.status_code": 200, "kb.sections.count": 1 },
      { "http.response.status_code": 403, "kb.sections.count": 0 },
    ]);
    expect(telemetry.span("retrieval.select").attributes).toEqual({
      "kb.candidates.count": 1,
      "kb.chunks.count": 1,
    });
    for (const value of allAttributeValues(telemetry.spans())) {
      expect(value).not.toMatch(/auxílio|home office|150|contoso/i);
    }
  });
});
