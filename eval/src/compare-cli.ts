// Renders a side-by-side comparison of two committed evaluation reports.
// Usage: npm run eval:compare -- <reportA.json> <reportB.json>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderComparison, type ReportJson } from "./compare.js";

const [pathA, pathB] = process.argv.slice(2);
if (!pathA || !pathB) {
  console.error("Usage: npm run eval:compare -- <reportA.json> <reportB.json>");
  process.exit(2);
}

const read = (path: string): ReportJson => JSON.parse(readFileSync(path, "utf8")) as ReportJson;
const a = read(pathA);
const b = read(pathB);

// The variants are part of the name so several comparisons of the same day can be committed.
const variant = (report: ReportJson): string =>
  `${report.meta.retriever ?? "graph"}-${report.meta.prompt ?? "v1"}`;
const output = new URL(
  `reports/comparison-${b.meta.date}-${variant(a)}-vs-${variant(b)}.md`,
  new URL("../../eval/", import.meta.url),
);
writeFileSync(output, `${renderComparison(a, b)}\n`);
console.log(`Comparison: ${fileURLToPath(output)}`);
