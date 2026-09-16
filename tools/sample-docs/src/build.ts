import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Document, HeadingLevel, LevelFormat, Packer, Paragraph } from "docx";
import { parseSampleDoc, type Block, type SampleDocMeta } from "./parse.js";

const root = join(import.meta.dirname, "../../..");
const sourceDir = join(root, "samples/documents");
const outDir = join(root, "samples/dist");

function toParagraph(block: Block): Paragraph {
  switch (block.kind) {
    case "heading":
      return new Paragraph({
        text: block.text,
        heading: block.level === 1 ? HeadingLevel.TITLE : HeadingLevel.HEADING_1,
      });
    case "bullet":
      return new Paragraph({ text: block.text, bullet: { level: 0 } });
    case "numbered":
      return new Paragraph({ text: block.text, numbering: { reference: "steps", level: 0 } });
    case "paragraph":
      return new Paragraph({ text: block.text });
  }
}

rmSync(outDir, { recursive: true, force: true });
const manifest: (SampleDocMeta & { file: string })[] = [];

for (const file of readdirSync(sourceDir).filter((f) => f.endsWith(".md") && f !== "README.md")) {
  const { meta, blocks } = parseSampleDoc(readFileSync(join(sourceDir, file), "utf8"), file);
  const doc = new Document({
    title: meta.title,
    creator: "Aurora Logística (fictional)",
    numbering: {
      config: [
        {
          reference: "steps",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1." }],
        },
      ],
    },
    sections: [{ children: blocks.map(toParagraph) }],
  });

  const target = join(outDir, meta.library, `${basename(file, ".md")}.docx`);
  mkdirSync(join(outDir, meta.library), { recursive: true });
  writeFileSync(target, await Packer.toBuffer(doc));
  manifest.push({ ...meta, file: `${meta.library}/${basename(target)}` });
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.length} documents generated in ${outDir}`);
