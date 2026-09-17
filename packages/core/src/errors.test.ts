import { describe, expect, it } from "vitest";
import { UpstreamError, isUpstreamError } from "./errors.js";

describe("UpstreamError", () => {
  it("carries a kind and is recognized by isUpstreamError", () => {
    const error = new UpstreamError("consent-required", "OBO failed");
    expect(error.kind).toBe("consent-required");
    expect(error.name).toBe("UpstreamError");
    expect(isUpstreamError(error)).toBe(true);
  });

  it("does not recognize other errors", () => {
    expect(isUpstreamError(new Error("x"))).toBe(false);
    expect(isUpstreamError("x")).toBe(false);
  });
});
