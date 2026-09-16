import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSampleDoc } from "./parse.js";

const samplesDir = join(import.meta.dirname, "../../../samples/documents");

describe("parseSampleDoc", () => {
  it("reads front matter and blocks", () => {
    const doc = parseSampleDoc(
      "---\ntitle: T\nlibrary: Politicas\naudience: todos\n---\n\n# T\n\nTexto.\n\n- item\n1. passo\n",
      "t.md",
    );
    expect(doc.meta).toEqual({ title: "T", library: "Politicas", audience: "todos" });
    expect(doc.blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "bullet", "numbered"]);
  });

  it("rejects an unknown audience", () => {
    expect(() =>
      parseSampleDoc("---\ntitle: T\nlibrary: X\naudience: diretoria\n---\n", "t.md"),
    ).toThrow(/audience/);
  });

  it("all documents in samples/documents are valid", () => {
    const files = readdirSync(samplesDir).filter((f) => f.endsWith(".md") && f !== "README.md");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(() => parseSampleDoc(readFileSync(join(samplesDir, f), "utf8"), f)).not.toThrow();
    }
  });
});
