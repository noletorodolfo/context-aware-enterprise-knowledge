import { describe, expect, it } from "vitest";
import { renderComparison, type ReportJson } from "./compare.js";

const report = (overrides: Partial<ReportJson> = {}): ReportJson => ({
  meta: {
    date: "2026-09-22",
    mode: "real",
    promptVersion: "v1",
    model: "gpt-4.1-mini",
    judge: "judge-v1",
    cases: 30,
    retriever: "graph",
    prompt: "v1",
  },
  passed: true,
  summary: {
    hitAt3: { value: 1, numerator: 25, denominator: 25 },
    mrr: { value: 0.96, count: 25 },
    withCitation: { value: 0.92, numerator: 23, denominator: 25 },
    citationPrecision: { value: 1, numerator: 23, denominator: 23 },
    correctRefusal: { value: 1, numerator: 8, denominator: 8 },
    groundedness: { value: 1, numerator: 23, denominator: 23, notJudged: 0 },
    factRecall: { value: 0.92, numerator: 23, denominator: 25 },
    p95LatencyMs: 3070,
    executions: 33,
    retries: 5,
    errors: 0,
    errorRate: 0,
    valid: true,
  },
  gates: {
    noLeak: { passed: true, checked: 25, failures: [] },
    injection: { passed: true, checked: 3, failures: [] },
    pii: { passed: true, checked: 4, failures: [] },
  },
  cases: [
    {
      caseId: "ans-01",
      category: "answerable",
      user: "B",
      result: "pass",
      reasons: [],
      latencyMs: 1,
    },
    {
      caseId: "ans-12",
      category: "answerable",
      user: "B",
      result: "fail",
      reasons: ["refused"],
      latencyMs: 1,
    },
  ],
  ...overrides,
});

const other = () =>
  report({
    meta: { ...report().meta, retriever: "aisearch", prompt: "v2", promptVersion: "v2" },
    summary: {
      ...report().summary,
      withCitation: { value: 1, numerator: 25, denominator: 25 },
      hitAt3: { value: 0.96, numerator: 24, denominator: 25 },
      p95LatencyMs: 2500,
    },
    cases: [
      {
        caseId: "ans-01",
        category: "answerable",
        user: "B",
        result: "fail",
        reasons: ["no citation"],
        latencyMs: 1,
      },
      {
        caseId: "ans-12",
        category: "answerable",
        user: "B",
        result: "pass",
        reasons: [],
        latencyMs: 1,
      },
    ],
  });

describe("renderComparison", () => {
  it("shows both configurations, their metrics and the delta", () => {
    const markdown = renderComparison(report(), other());

    expect(markdown).toContain("graph / v1");
    expect(markdown).toContain("aisearch / v2");
    expect(markdown).toMatch(/Answers with ≥ 1 valid citation \| 92\.0% \| 100\.0% \| \+8\.0 pp/);
    expect(markdown).toMatch(/Retrieval hit rate@3 \| 100\.0% \| 96\.0% \| -4\.0 pp/);
    expect(markdown).toMatch(/End-to-end latency p95 \| 3\.07 s \| 2\.50 s \| -0\.57 s/);
  });

  it("lists the hard gates of both configurations", () => {
    expect(renderComparison(report(), other())).toMatch(/No leak \| ✅ pass \| ✅ pass/);
  });

  it("names the cases whose result changed, in both directions", () => {
    const markdown = renderComparison(report(), other());
    expect(markdown).toContain("| ans-01 | B | pass | fail |");
    expect(markdown).toContain("| ans-12 | B | fail | pass |");
  });

  it("handles a metric that is n/a in one of the reports", () => {
    const missing = report({
      summary: {
        ...report().summary,
        groundedness: { value: null, numerator: 0, denominator: 0, notJudged: 25 },
      },
    });
    const markdown = renderComparison(missing, other());
    expect(markdown).toMatch(/Groundedness[^|]*\| n\/a \| 100\.0% \| n\/a/);
  });

  it("never prints question, document or answer text", () => {
    const markdown = renderComparison(report(), other());
    for (const fragment of ["auxílio", "home office", "R$", "Não encontrei"]) {
      expect(markdown).not.toContain(fragment);
    }
  });
});
