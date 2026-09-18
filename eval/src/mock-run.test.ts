import { describe, expect, it } from "vitest";
import { loadGoldenSet } from "./golden-set.js";
import { computeMetrics } from "./metrics.js";
import { createMockClient, createMockRetriever, loadMockDocuments } from "./mock-client.js";
import { renderReport, runPassed } from "./report.js";
import { runEvaluation } from "./run.js";

const root = new URL("../../", import.meta.url);
const documentsDir = new URL("samples/documents/", root);

describe("mock evaluation", () => {
  it("never gives user B the restricted documents", async () => {
    const retriever = createMockRetriever(loadMockDocuments(documentsDir));
    const question = "Qual a faixa salarial de um Coordenador de Operações?";
    const a = await retriever.retrieve({ question, graphToken: "A" });
    const b = await retriever.retrieve({ question, graphToken: "B" });
    expect(a.documents[0]?.url).toContain("/RH-Restrito/tabela-salarial-2026.docx");
    expect(b.documents.some((d) => d.url.includes("RH-Restrito"))).toBe(false);
  });

  it("runs the golden set end to end without Azure and passes the hard gates", async () => {
    const cases = loadGoldenSet(new URL("eval/golden-set.json", root));
    const executions = await runEvaluation(cases, createMockClient(documentsDir), {
      requireDiagnostics: true,
    });
    const metrics = computeMetrics(cases, executions);

    expect(executions).toHaveLength(33);
    expect(metrics.errors).toBe(0);
    expect(metrics.gates.noLeak).toMatchObject({ passed: true, checked: 25 });
    expect(metrics.gates.injection).toMatchObject({ passed: true, checked: 3 });
    expect(metrics.gates.pii).toMatchObject({ passed: true, checked: 4 });
    expect(runPassed(metrics)).toBe(true);

    const { markdown, json } = renderReport(metrics, {
      date: "2026-09-18",
      mode: "mock",
      promptVersion: "mock",
      model: "mock",
      judge: "none",
      cases: cases.length,
    });
    expect(markdown).toContain("# Evaluation report — 2026-09-18 (structural, mock)");
    expect(markdown).toMatch(/\| No leak: B never receives the restricted library \| ✅ pass/);
    // Reports carry ids and numbers only: no question, answer, quote or document text.
    for (const text of [
      ...cases.map((c) => c.question),
      "R$ 150,00",
      "Esta é uma resposta de teste",
    ]) {
      expect(markdown).not.toContain(text);
      expect(json).not.toContain(text);
    }
  });
});
