import { isUpstreamError } from "@kb/core";
import type { ChatClient, ChatCompletionResponse, JsonSchemaFormat } from "@kb/llm-providers";
import type { JudgeVerdict } from "./metrics.js";
import { NO_RETRY, withRetry, type RetryPolicy } from "./retry.js";

export const JUDGE_PROMPT_VERSION = "judge-v1";

export const JUDGE_JSON_SCHEMA: JsonSchemaFormat = {
  name: "groundedness_verdict",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["score", "unsupportedClaims"],
    properties: {
      score: { type: "integer" },
      unsupportedClaims: { type: "array", items: { type: "string" } },
    },
  },
};

export interface JudgeInput {
  question: string;
  answer: string;
  quotes: string[];
}

export type Judge = (input: JudgeInput) => Promise<JudgeVerdict | "not-judged">;

/** Keeps our own delimiters out of the data so it cannot close or open sections. */
const neutralize = (text: string) =>
  text.replace(/<\s*(\/?)\s*(question|answer|quotes?)\b\s*(>)?/gi, "‹$1$2$3");

export function buildJudgeMessage({ question, answer, quotes }: JudgeInput): string {
  const quoteTags = quotes.map((quote) => `<quote>${neutralize(quote)}</quote>`).join("\n");
  return (
    `<question>\n${neutralize(question)}\n</question>\n` +
    `<answer>\n${neutralize(answer)}\n</answer>\n` +
    `<quotes>\n${quoteTags}\n</quotes>`
  );
}

/** A verdict only when the output is valid JSON with an integer score from 1 to 5. */
export function parseJudgeOutput(content: string): JudgeVerdict | "not-judged" {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return "not-judged";
  }
  const { score, unsupportedClaims } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
    return "not-judged";
  }
  if (!Array.isArray(unsupportedClaims) || !unsupportedClaims.every((c) => typeof c === "string")) {
    return "not-judged";
  }
  return { score, unsupportedClaims };
}

/** LLM-as-judge for groundedness; any failure yields "not-judged" (excluded from the average). */
export function createJudge(
  chat: ChatClient,
  systemPrompt: string,
  retry: RetryPolicy = NO_RETRY,
): Judge {
  const call = async (
    input: JudgeInput,
  ): Promise<ChatCompletionResponse | "throttled" | "failed"> => {
    try {
      return await chat.complete({
        system: systemPrompt,
        user: buildJudgeMessage(input),
        maxOutputTokens: 300,
        jsonSchema: JUDGE_JSON_SCHEMA,
      });
    } catch (error) {
      return isUpstreamError(error) && error.detail?.status === 429 ? "throttled" : "failed";
    }
  };
  return async (input) => {
    const { result } = await withRetry(
      retry,
      () => call(input),
      (r) => r === "throttled",
    );
    return typeof result === "string" ? "not-judged" : parseJudgeOutput(result.content);
  };
}
