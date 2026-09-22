import { describe, expect, it } from "vitest";
import { buildChunks, chunkId, type IndexedDocument } from "./chunks.js";

const doc = (overrides: Partial<IndexedDocument> = {}): IndexedDocument => ({
  docId: "01ABCDEF",
  title: "politica-home-office",
  url: "https://contoso.sharepoint.com/sites/kb-demo/Politicas/politica-home-office.docx",
  library: "Politicas",
  aclGroups: ["group-colaboradores"],
  sections: [
    { heading: "Auxílio", text: "A empresa paga auxílio home office de R$ 150,00 por mês." },
    { heading: "Regras", text: "Até 3 dias por semana." },
  ],
  ...overrides,
});

describe("chunkId", () => {
  it("keeps only characters Azure AI Search accepts in a key", () => {
    expect(chunkId("01ABC!DEF.GHI%JK", 2)).toMatch(/^[A-Za-z0-9_\-=]+$/);
  });

  it("is stable across runs", () => {
    expect(chunkId("01ABC!DEF", 1)).toBe(chunkId("01ABC!DEF", 1));
  });

  it("stays unique for document ids that sanitize to the same text", () => {
    expect(chunkId("doc!1", 0)).not.toBe(chunkId("doc.1", 0));
  });

  it("separates sections of the same document", () => {
    expect(chunkId("doc1", 0)).not.toBe(chunkId("doc1", 1));
  });
});

describe("buildChunks", () => {
  it("maps every section to a chunk with its document metadata and ACL groups", () => {
    const [first, second] = buildChunks([doc()]);

    expect(first).toMatchObject({
      docId: "01ABCDEF",
      title: "politica-home-office",
      library: "Politicas",
      section: "Auxílio",
      content: "A empresa paga auxílio home office de R$ 150,00 por mês.",
      aclGroups: ["group-colaboradores"],
    });
    expect(first?.id).toBe(chunkId("01ABCDEF", 0));
    expect(second?.section).toBe("Regras");
  });

  it("drops sections without text", () => {
    const chunks = buildChunks([
      doc({
        sections: [
          { heading: "Vazia", text: "   " },
          { heading: "Ok", text: "conteúdo" },
        ],
      }),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.section).toBe("Ok");
  });

  it("refuses a document without ACL groups, so nothing is indexed unprotected", () => {
    expect(() => buildChunks([doc({ aclGroups: [] })])).toThrow(/aclGroups/);
  });

  it("builds the text that gets embedded from title, section and content", () => {
    const [chunk] = buildChunks([doc()]);
    expect(chunk?.embeddingInput).toBe(
      "politica-home-office\nAuxílio\nA empresa paga auxílio home office de R$ 150,00 por mês.",
    );
  });
});
