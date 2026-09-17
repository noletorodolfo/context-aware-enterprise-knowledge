import { describe, expect, it } from "vitest";
import { selectChunks, type CandidateSection } from "./select.js";

const candidate = (sectionIndex: number, heading: string, text: string): CandidateSection => ({
  docId: "item-1",
  title: "politica-home-office",
  url: "https://contoso.sharepoint.com/sites/kb-demo/Politicas/politica-home-office.docx",
  sectionIndex,
  heading,
  text,
});

describe("selectChunks", () => {
  it("keeps only sections matching keywords, ordered by score, as chunks", () => {
    const chunks = selectChunks(
      ["auxilio", "mensal"],
      [
        candidate(0, "Regras", "Até 3 dias por semana."),
        candidate(1, "Auxílio", "Auxílio mensal de R$ 150,00."),
        candidate(2, "Equipamentos", "O auxílio inclui headset."),
      ],
      { maxSections: 8, maxChars: 12_000 },
    );
    expect(chunks.map((c) => c.id)).toEqual(["item-1#1", "item-1#2"]);
    expect(chunks[0]).toMatchObject({
      docId: "item-1",
      title: "politica-home-office",
      text: "Auxílio\nAuxílio mensal de R$ 150,00.",
      score: 3,
    });
  });

  it("respects the section and character limits", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate(i, "Auxílio", "auxilio ".repeat(10)),
    );
    expect(selectChunks(["auxilio"], many, { maxSections: 8, maxChars: 12_000 })).toHaveLength(8);
    expect(selectChunks(["auxilio"], many, { maxSections: 8, maxChars: 200 })).toHaveLength(2);
  });

  it("returns nothing when no section matches", () => {
    expect(
      selectChunks(["salario"], [candidate(0, "Regras", "Até 3 dias.")], {
        maxSections: 8,
        maxChars: 12_000,
      }),
    ).toEqual([]);
  });
});
