import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { describe, expect, it } from "vitest";
import { extractSections } from "./docx-sections.js";

async function docxBuffer(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Política de Home Office", heading: HeadingLevel.TITLE }),
          new Paragraph({ text: "Versão 3.1 & vigente." }),
          new Paragraph({ text: "Regras", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Até 3 dias por semana.", bullet: { level: 0 } }),
          new Paragraph({ text: "Presença às terças." }),
          new Paragraph({ text: "Auxílio", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "R$ 150,00 por mês." }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe("extractSections", () => {
  it("splits a .docx into sections by heading with plain text", async () => {
    const sections = await extractSections(await docxBuffer());
    expect(sections).toEqual([
      { heading: "Política de Home Office", text: "Versão 3.1 & vigente." },
      { heading: "Regras", text: "Até 3 dias por semana.\nPresença às terças." },
      { heading: "Auxílio", text: "R$ 150,00 por mês." },
    ]);
  });
});
