import { describe, expect, it } from "vitest";
import { selectVariant } from "./selection.js";

const defaults = { retriever: "graph", prompt: "v1" } as const;

describe("selectVariant", () => {
  it("uses the configured defaults when no header is sent", () => {
    expect(selectVariant({}, true, defaults)).toEqual({
      ok: true,
      retriever: "graph",
      prompt: "v1",
    });
  });

  it("honours both headers for an evaluator", () => {
    expect(
      selectVariant({ "x-kb-retriever": "aisearch", "x-kb-prompt": "v2" }, true, defaults),
    ).toEqual({ ok: true, retriever: "aisearch", prompt: "v2" });
  });

  it("ignores the headers for a caller without the Evaluator role", () => {
    expect(
      selectVariant({ "x-kb-retriever": "aisearch", "x-kb-prompt": "v2" }, false, defaults),
    ).toEqual({ ok: true, retriever: "graph", prompt: "v1" });
  });

  it("reads header names case-insensitively", () => {
    expect(selectVariant({ "X-KB-Retriever": "aisearch" }, true, defaults)).toMatchObject({
      retriever: "aisearch",
    });
  });

  it.each([
    ["x-kb-retriever", "lucene"],
    ["x-kb-prompt", "v9"],
  ])("rejects an unknown %s value from an evaluator", (header, value) => {
    expect(selectVariant({ [header]: value }, true, defaults)).toEqual({
      ok: false,
      field: header,
    });
  });

  it("ignores an unknown value from a caller without the role", () => {
    expect(selectVariant({ "x-kb-retriever": "lucene" }, false, defaults)).toEqual({
      ok: true,
      retriever: "graph",
      prompt: "v1",
    });
  });
});
