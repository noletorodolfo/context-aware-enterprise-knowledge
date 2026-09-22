import type { CaseResult, Gate, Metrics } from "./metrics.js";
import type { ReportMeta } from "./report.js";

export interface ReportJson {
  meta: ReportMeta;
  passed: boolean;
  summary: Pick<
    Metrics,
    | "hitAt3"
    | "mrr"
    | "withCitation"
    | "citationPrecision"
    | "correctRefusal"
    | "groundedness"
    | "factRecall"
    | "p95LatencyMs"
    | "executions"
    | "retries"
    | "errors"
    | "errorRate"
    | "valid"
  >;
  gates: { noLeak: Gate; injection: Gate; pii: Gate };
  cases: CaseResult[];
}

const label = (report: ReportJson) =>
  `${report.meta.retriever ?? "graph"} / ${report.meta.prompt ?? "v1"}`;
const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const seconds = (value: number | null) =>
  value === null ? "n/a" : `${(value / 1000).toFixed(2)} s`;
const mark = (gate: Gate) => (gate.passed ? "✅ pass" : "❌ fail");

const deltaPoints = (a: number | null, b: number | null) =>
  a === null || b === null
    ? "n/a"
    : `${b >= a ? "+" : "-"}${(Math.abs(b - a) * 100).toFixed(1)} pp`;

const deltaSeconds = (a: number | null, b: number | null) =>
  a === null || b === null
    ? "n/a"
    : `${b >= a ? "+" : "-"}${(Math.abs(b - a) / 1000).toFixed(2)} s`;

/**
 * Side-by-side view of two evaluation runs. It reads only committed report JSON, so it repeats the
 * same ids, numbers and reasons: no question, document or answer text can reach it.
 */
export function renderComparison(a: ReportJson, b: ReportJson): string {
  const metrics: [string, string, string, string][] = [
    [
      "Retrieval hit rate@3",
      pct(a.summary.hitAt3.value),
      pct(b.summary.hitAt3.value),
      deltaPoints(a.summary.hitAt3.value, b.summary.hitAt3.value),
    ],
    [
      "MRR",
      a.summary.mrr.value?.toFixed(3) ?? "n/a",
      b.summary.mrr.value?.toFixed(3) ?? "n/a",
      a.summary.mrr.value === null || b.summary.mrr.value === null
        ? "n/a"
        : (b.summary.mrr.value - a.summary.mrr.value).toFixed(3),
    ],
    [
      "Answers with ≥ 1 valid citation",
      pct(a.summary.withCitation.value),
      pct(b.summary.withCitation.value),
      deltaPoints(a.summary.withCitation.value, b.summary.withCitation.value),
    ],
    [
      "Citation precision",
      pct(a.summary.citationPrecision.value),
      pct(b.summary.citationPrecision.value),
      deltaPoints(a.summary.citationPrecision.value, b.summary.citationPrecision.value),
    ],
    [
      "Correct refusal",
      pct(a.summary.correctRefusal.value),
      pct(b.summary.correctRefusal.value),
      deltaPoints(a.summary.correctRefusal.value, b.summary.correctRefusal.value),
    ],
    [
      "Groundedness (judge ≥ 4)",
      pct(a.summary.groundedness.value),
      pct(b.summary.groundedness.value),
      deltaPoints(a.summary.groundedness.value, b.summary.groundedness.value),
    ],
    [
      "Expected facts in the answer",
      pct(a.summary.factRecall.value),
      pct(b.summary.factRecall.value),
      deltaPoints(a.summary.factRecall.value, b.summary.factRecall.value),
    ],
    [
      "End-to-end latency p95",
      seconds(a.summary.p95LatencyMs),
      seconds(b.summary.p95LatencyMs),
      deltaSeconds(a.summary.p95LatencyMs, b.summary.p95LatencyMs),
    ],
  ];

  const resultOf = (report: ReportJson, caseId: string, user: string) =>
    report.cases.find((entry) => entry.caseId === caseId && entry.user === user)?.result;

  const changed = a.cases
    .map((entry) => ({
      caseId: entry.caseId,
      user: entry.user,
      before: entry.result,
      after: resultOf(b, entry.caseId, entry.user),
    }))
    .filter((entry) => entry.after !== undefined && entry.after !== entry.before);

  return [
    `# Evaluation comparison — ${b.meta.date}`,
    "",
    `**A:** ${label(a)} (${a.meta.model}, ${a.meta.executions ?? a.summary.executions} executions)`,
    `**B:** ${label(b)} (${b.meta.model}, ${b.summary.executions} executions)`,
    "",
    "## Hard gates",
    "",
    `| Gate | ${label(a)} | ${label(b)} |`,
    "| --- | --- | --- |",
    `| No leak | ${mark(a.gates.noLeak)} | ${mark(b.gates.noLeak)} |`,
    `| Injection resisted | ${mark(a.gates.injection)} | ${mark(b.gates.injection)} |`,
    `| PII masked | ${mark(a.gates.pii)} | ${mark(b.gates.pii)} |`,
    "",
    "## Quality",
    "",
    `| Metric | ${label(a)} | ${label(b)} | Delta |`,
    "| --- | --- | --- | --- |",
    ...metrics.map(([name, left, right, delta]) => `| ${name} | ${left} | ${right} | ${delta} |`),
    "",
    "## Cases that changed",
    "",
    ...(changed.length === 0
      ? ["No case changed its result."]
      : [
          `| Case | User | ${label(a)} | ${label(b)} |`,
          "| --- | --- | --- | --- |",
          ...changed.map(
            (entry) => `| ${entry.caseId} | ${entry.user} | ${entry.before} | ${entry.after} |`,
          ),
        ]),
    "",
    "_Ids, counts and reasons only; this repository is public._",
  ].join("\n");
}
