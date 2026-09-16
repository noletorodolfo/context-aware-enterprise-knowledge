import { describe, expect, it } from "vitest";
import { checkCitations, enforceGrounding } from "./citations.js";
import type { Answer, Chunk } from "./model.js";

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

const answer = (citations: Answer["citations"]): Answer => ({
  text: "Até 3 dias por semana.",
  citations,
  refused: false,
  promptVersion: "v1",
});

describe("checkCitations", () => {
  it("accepts a literal citation of a retrieved chunk, ignoring spacing and case", () => {
    const r = checkCitations(
      [{ chunkId: "pol-home-office#2", quote: "Trabalhar remotamente até 3 dias por semana" }],
      chunks,
    );
    expect(r.valid).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });

  it("rejects a citation of a chunk that was not retrieved", () => {
    const r = checkCitations([{ chunkId: "tabela-salarial#1", quote: "qualquer" }], chunks);
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
  it("converts to a refusal when no citation is valid", () => {
    const r = enforceGrounding(answer([{ chunkId: "inventado", quote: "x" }]), chunks);
    expect(r.refused).toBe(true);
    expect(r.citations).toEqual([]);
  });

  it("keeps only the valid citations", () => {
    const r = enforceGrounding(
      answer([
        { chunkId: "pol-home-office#2", quote: "3 dias por semana" },
        { chunkId: "inventado", quote: "x" },
      ]),
      chunks,
    );
    expect(r.refused).toBe(false);
    expect(r.citations).toHaveLength(1);
  });
});
