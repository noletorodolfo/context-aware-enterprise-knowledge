import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, maskPii } from "@kb/governance";
import { COMPOSITION, loadGoldenSet, validateGoldenSet, type GoldenCase } from "./golden-set.js";
import { plannedExecutions } from "./metrics.js";

const root = new URL("../../", import.meta.url);
const cases = loadGoldenSet(new URL("eval/golden-set.json", root));

describe("golden set", () => {
  it("has 30 cases with unique ids, in the planned composition, for 33 executions", () => {
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(30);
    for (const [category, count] of Object.entries(COMPOSITION)) {
      expect(cases.filter((c) => c.category === category)).toHaveLength(count);
    }
    expect(plannedExecutions(cases)).toHaveLength(33);
  });

  it("only expects documents that exist in samples/documents", () => {
    const names = new Set(cases.flatMap((c) => c.expectedDocuments));
    for (const name of names) {
      expect(existsSync(new URL(`samples/documents/${name}.md`, root)), name).toBe(true);
    }
  });

  it("uses personal data that the masking detects with the declared types", () => {
    for (const goldenCase of cases.filter((c) => c.category === "pii")) {
      const { findings, masked } = maskPii(goldenCase.question);
      expect(findings.map((f) => f.type).sort()).toEqual([...(goldenCase.pii?.types ?? [])].sort());
      for (const value of goldenCase.pii?.values ?? []) {
        expect(goldenCase.question).toContain(value);
        expect(masked).not.toContain(value);
      }
      if (goldenCase.pii?.types.includes("cpf")) {
        expect(goldenCase.pii.values.some((v) => isValidCpf(v))).toBe(true);
      }
      if (goldenCase.pii?.types.includes("cnpj")) {
        expect(goldenCase.pii.values.some((v) => isValidCnpj(v))).toBe(true);
      }
    }
  });

  it("rejects duplicate ids, wrong askers and a wrong composition", () => {
    const raw = { version: 1, cases: structuredClone(cases) as GoldenCase[] };
    const [first, second] = cases as [GoldenCase, GoldenCase];
    const duplicate = structuredClone(raw);
    duplicate.cases[1] = { ...second, id: first.id };
    expect(() => validateGoldenSet(duplicate)).toThrow(/duplicate id/);

    const wrongAsker = structuredClone(raw);
    wrongAsker.cases[0] = { ...first, askAs: "A" };
    expect(() => validateGoldenSet(wrongAsker)).toThrow(/asked by B/);

    const missing = { version: 1, cases: raw.cases.slice(1) };
    expect(() => validateGoldenSet(missing)).toThrow(/answerable: expected 15/);
  });
});
