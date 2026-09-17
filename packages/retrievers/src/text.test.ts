import { describe, expect, it } from "vitest";
import { buildSearchQuery, extractKeywords, normalizeText } from "./text.js";

describe("text helpers", () => {
  it("normalizes case and diacritics", () => {
    expect(normalizeText("Auxílio SALARIAL Ação")).toBe("auxilio salarial acao");
  });

  it("extracts unique keywords without stopwords or short words", () => {
    expect(extractKeywords("Qual é o valor do auxílio home office? O auxílio é mensal?")).toEqual([
      "valor",
      "auxilio",
      "home",
      "office",
      "mensal",
    ]);
  });

  it("limits the number of keywords", () => {
    expect(extractKeywords("alfa beta gama delta epsilon zeta theta iota kappa", 3)).toEqual([
      "alfa",
      "beta",
      "gama",
    ]);
  });

  it("builds a KQL query restricted to the configured sites", () => {
    expect(
      buildSearchQuery(
        ["auxilio", "home"],
        ["https://contoso.sharepoint.com/sites/kb-demo", "https://contoso.sharepoint.com/sites/x/"],
      ),
    ).toBe(
      '(auxilio OR home) AND (path:"https://contoso.sharepoint.com/sites/kb-demo" OR path:"https://contoso.sharepoint.com/sites/x")',
    );
  });
});
