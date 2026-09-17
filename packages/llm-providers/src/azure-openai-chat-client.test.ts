import { describe, expect, it } from "vitest";
import { describeOpenAiError } from "./azure-openai-chat-client.js";

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
});
