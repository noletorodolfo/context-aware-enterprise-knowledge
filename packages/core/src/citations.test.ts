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
  it("aceita citação literal de trecho recuperado, ignorando espaços e caixa", () => {
    const r = checkCitations(
      [{ chunkId: "pol-home-office#2", quote: "Trabalhar remotamente até 3 dias por semana" }],
      chunks,
    );
    expect(r.valid).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });

  it("rejeita citação de trecho que não foi recuperado", () => {
    const r = checkCitations([{ chunkId: "tabela-salarial#1", quote: "qualquer" }], chunks);
    expect(r.rejected[0]?.reason).toBe("unknown-chunk");
  });

  it("rejeita citação que não existe no texto do trecho", () => {
    const r = checkCitations(
      [{ chunkId: "pol-home-office#2", quote: "5 dias por semana" }],
      chunks,
    );
    expect(r.rejected[0]?.reason).toBe("quote-not-found");
  });
});

describe("enforceGrounding", () => {
  it("converte em recusa quando nenhuma citação é válida", () => {
    const r = enforceGrounding(answer([{ chunkId: "inventado", quote: "x" }]), chunks);
    expect(r.refused).toBe(true);
    expect(r.citations).toEqual([]);
  });

  it("mantém só as citações válidas", () => {
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
