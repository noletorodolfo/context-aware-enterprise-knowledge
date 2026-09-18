import { describe, expect, it } from "vitest";
import type { GoldenCase } from "./golden-set.js";
import { computeMetrics } from "./metrics.js";
import { renderReport } from "./report.js";

const meta = {
  date: "2026-09-18",
  mode: "real" as const,
  promptVersion: "v1",
  model: "gpt-4.1-mini",
  judge: "judge-v1",
  cases: 1,
};

describe("renderReport", () => {
  it("names the gate of each failure, marks invalid runs and reports retries", () => {
    const cases: GoldenCase[] = [
      {
        id: "pii-01",
        category: "pii",
        question: "q",
        askAs: "B",
        expectedDocuments: ["politica-home-office"],
        expectedFacts: [],
        mustNotCite: [],
        pii: { types: ["cpf"], values: ["529.982.247-25"] },
      },
    ];
    const metrics = computeMetrics(cases, [
      { caseId: "pii-01", user: "B", status: "error", httpStatus: 503, latencyMs: 5, attempts: 4 },
    ]);
    const { markdown, json } = renderReport(metrics, meta);

    expect(markdown).toContain("- No leak — pii-01/B: not verified (HTTP 503)");
    expect(markdown).toContain("- PII — pii-01/B: not verified (HTTP 503)");
    expect(markdown).toContain("**Run invalid:**");
    expect(markdown).toContain("| Retries after throttling | 3 |");
    expect(JSON.parse(json)).toMatchObject({ passed: false, summary: { retries: 3 } });
  });
});
