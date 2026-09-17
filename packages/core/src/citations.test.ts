import { describe, expect, it } from "vitest";
import { REFUSAL_TEXT, checkCitations, enforceGrounding, refusal } from "./citations.js";
import type { Chunk, DraftAnswer } from "./model.js";

const chunks: Chunk[] = [
  {
    id: "pol-home-office#2",
    docId: "pol-home-office",
    title: "Política de Home Office",
    url: "https://example.sharepoint.com/sites/kb/Politicas/home-office.docx",
    text: "O colaborador pode trabalhar remotamente até  3 dias por semana, mediante acordo com o gestor.",
    score: 0.91,
  },
];

const draft = (citations: DraftAnswer["citations"]): DraftAnswer => ({
  text: "Até 3 dias por semana.",
  citations,
  refused: false,
  promptVersion: "v1",
});

describe("checkCitations", () => {
  it("accepts a literal citation of a retrieved chunk, ignoring whitespace and case, and adds title and url", () => {
    const r = checkCitations(
      [{ chunkId: "pol-home-office#2", quote: "Trabalhar remotamente até 3 dias por semana" }],
      chunks,
    );
    expect(r.valid).toEqual([
      {
        chunkId: "pol-home-office#2",
        quote: "Trabalhar remotamente até 3 dias por semana",
        title: "Política de Home Office",
        url: "https://example.sharepoint.com/sites/kb/Politicas/home-office.docx",
      },
    ]);
    expect(r.rejected).toHaveLength(0);
  });

  it("rejects a citation of a chunk that was not retrieved", () => {
    const r = checkCitations([{ chunkId: "tabela-salarial#1", quote: "anything" }], chunks);
    expect(r.rejected[0]?.reason).toBe("unknown-chunk");
  });

  it("rejects a citation that does not exist in the chunk text", () => {
    const r = checkCitations(
      [{ chunkId: "pol-home-office#2", quote: "5 dias por semana" }],
      chunks,
    );
    expect(r.rejected[0]?.reason).toBe("quote-not-found");
  });
});

describe("enforceGrounding", () => {
  it("turns into the refusal when no citation is valid", () => {
    expect(enforceGrounding(draft([{ chunkId: "invented", quote: "x" }]), chunks)).toEqual(
      refusal("v1"),
    );
  });

  it("turns into the refusal when the draft has no citations", () => {
    expect(enforceGrounding(draft([]), chunks)).toEqual(refusal("v1"));
  });

  it("keeps only the valid citations, enriched", () => {
    const r = enforceGrounding(
      draft([
        { chunkId: "pol-home-office#2", quote: "3 dias por semana" },
        { chunkId: "invented", quote: "x" },
      ]),
      chunks,
    );
    expect(r.refused).toBe(false);
    expect(r.text).toBe("Até 3 dias por semana.");
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0]?.title).toBe("Política de Home Office");
  });

  it("keeps a refused draft refused", () => {
    expect(enforceGrounding({ ...draft([]), refused: true }, chunks)).toEqual(refusal("v1"));
  });
});

describe("refusal", () => {
  it("uses the exact pt-BR refusal text", () => {
    expect(REFUSAL_TEXT).toBe(
      "Não encontrei essa informação nos documentos disponíveis para você.",
    );
    expect(refusal("v1")).toEqual({
      text: REFUSAL_TEXT,
      citations: [],
      refused: true,
      promptVersion: "v1",
    });
  });
});
