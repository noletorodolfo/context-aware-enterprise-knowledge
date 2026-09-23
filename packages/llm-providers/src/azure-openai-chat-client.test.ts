import { describe, expect, it } from "vitest";
import { BadRequestError, RateLimitError } from "openai";
import { describeOpenAiError, toUpstreamError } from "./azure-openai-chat-client.js";

describe("describeOpenAiError", () => {
  it("describes a plain Error by its name only", () => {
    expect(describeOpenAiError(new Error("boom"))).toEqual({ errorName: "Error" });
  });

  it("extracts status/code/type/param from an SDK APIError shape, never the message", () => {
    const apiError = {
      name: "BadRequestError",
      status: 400,
      code: "content_filter",
      type: "invalid_request_error",
      error: { innererror: { code: "ResponsibleAIPolicyViolation" } },
      message: "secret prompt text",
    };
    const detail = describeOpenAiError(apiError);
    expect(detail).toEqual({
      errorName: "BadRequestError",
      status: 400,
      code: "content_filter",
      type: "invalid_request_error",
      contentFilter: true,
      innerCode: "ResponsibleAIPolicyViolation",
    });
    expect(JSON.stringify(detail)).not.toContain("secret prompt text");
  });

  it("names the filter categories that fired, and nothing about the content", () => {
    const apiError = {
      name: "BadRequestError",
      status: 400,
      code: "content_filter",
      error: {
        innererror: {
          code: "ResponsibleAIPolicyViolation",
          content_filter_result: {
            hate: { filtered: false, severity: "safe" },
            self_harm: { filtered: true, severity: "medium" },
            jailbreak: { filtered: true, detected: true },
          },
        },
      },
      message: "secret prompt text",
    };
    const detail = describeOpenAiError(apiError);
    expect(detail.filteredCategories).toBe("jailbreak,self_harm");
    expect(JSON.stringify(detail)).not.toContain("secret prompt text");
  });

  it("describes a 429 rate limit error", () => {
    const apiError = { name: "RateLimitError", status: 429, code: "rate_limit_exceeded" };
    expect(describeOpenAiError(apiError)).toEqual({
      errorName: "RateLimitError",
      status: 429,
      code: "rate_limit_exceeded",
    });
  });

  it("describes a non-Error value", () => {
    expect(describeOpenAiError("some string failure")).toEqual({ errorName: "String" });
  });

  it("reports the real SDK subclass name for a BadRequestError content-filter rejection", () => {
    const apiError = new BadRequestError(
      400,
      {
        code: "content_filter",
        param: "prompt",
        innererror: { code: "ResponsibleAIPolicyViolation" },
      },
      "secret prompt text",
      new Headers(),
    );
    const detail = describeOpenAiError(apiError);
    expect(detail).toEqual({
      errorName: "BadRequestError",
      status: 400,
      code: "content_filter",
      param: "prompt",
      contentFilter: true,
      innerCode: "ResponsibleAIPolicyViolation",
    });
    expect(JSON.stringify(detail)).not.toContain("secret prompt text");
    expect(toUpstreamError(apiError).kind).toBe("llm-content-filtered");
  });

  it("reports the real SDK subclass name for a RateLimitError", () => {
    const apiError = new RateLimitError(
      429,
      { code: "rate_limit_exceeded" },
      "secret prompt text",
      new Headers(),
    );
    const detail = describeOpenAiError(apiError);
    expect(detail).toEqual({
      errorName: "RateLimitError",
      status: 429,
      code: "rate_limit_exceeded",
    });
    expect(toUpstreamError(apiError).kind).toBe("llm-unavailable");
  });
});

describe("toUpstreamError", () => {
  it("classifies a content-filter API error as llm-content-filtered with detail", () => {
    const apiError = {
      name: "BadRequestError",
      status: 400,
      code: "content_filter",
      param: "prompt",
      error: { innererror: { code: "ResponsibleAIPolicyViolation" } },
      message: "secret prompt text",
    };
    const upstreamError = toUpstreamError(apiError);
    expect(upstreamError.kind).toBe("llm-content-filtered");
    expect(upstreamError.detail).toEqual({
      errorName: "BadRequestError",
      status: 400,
      code: "content_filter",
      param: "prompt",
      contentFilter: true,
      innerCode: "ResponsibleAIPolicyViolation",
    });
    expect(upstreamError.message).not.toContain("secret prompt text");
  });

  it("classifies a 429 rate limit error as llm-unavailable", () => {
    const apiError = { name: "RateLimitError", status: 429, code: "rate_limit_exceeded" };
    const upstreamError = toUpstreamError(apiError);
    expect(upstreamError.kind).toBe("llm-unavailable");
    expect(upstreamError.detail).toEqual({
      errorName: "RateLimitError",
      status: 429,
      code: "rate_limit_exceeded",
    });
  });

  it("classifies a plain Error as llm-unavailable", () => {
    const upstreamError = toUpstreamError(new Error("socket hang up"));
    expect(upstreamError.kind).toBe("llm-unavailable");
    expect(upstreamError.detail).toEqual({ errorName: "Error" });
  });
});
