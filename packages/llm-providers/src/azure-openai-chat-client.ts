import { getBearerTokenProvider, type TokenCredential } from "@azure/identity";
import { UpstreamError, type UpstreamErrorDetail } from "@kb/core";
import { AzureOpenAI } from "openai";
import type { ChatClient } from "./azure-openai.js";

interface ApiErrorShape {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  type?: unknown;
  param?: unknown;
  error?: {
    innererror?: {
      code?: unknown;
      content_filter_result?: Record<string, { filtered?: unknown }>;
    };
  };
}

/**
 * Category names only (`hate`, `self_harm`, `violence`, `jailbreak`, ...) of the filters that
 * fired. The categories say which policy blocked the answer without revealing what was asked or
 * retrieved, which is the difference between a diagnosable refusal and an opaque one.
 */
function filteredCategories(result: Record<string, { filtered?: unknown }> | undefined): string {
  if (!result) return "";
  return Object.entries(result)
    .filter(([, value]) => value?.filtered === true)
    .map(([category]) => category)
    .sort()
    .join(",");
}

/**
 * Resolves a diagnostic error class name. Real `openai` SDK errors (`BadRequestError`,
 * `RateLimitError`, ...) never set their own `name`, so `error.name` is just the inherited
 * `"Error"` from the `Error` prototype chain; `error.constructor.name` is what actually carries
 * the subclass. Falls back to `error.name` (e.g. for plain `Error`s, or test doubles that set
 * `name` on a plain object) and finally to `"Unknown"`.
 */
function resolveErrorName(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const ctorName = (error as { constructor?: { name?: string } }).constructor?.name;
    if (typeof ctorName === "string" && ctorName !== "Object" && ctorName !== "Error") {
      return ctorName;
    }
    const nameProperty = (error as ApiErrorShape).name;
    if (typeof nameProperty === "string" && nameProperty.length > 0) return nameProperty;
    return ctorName ?? "Unknown";
  }
  const nameProperty = (error as ApiErrorShape | null)?.name;
  if (typeof nameProperty === "string") return nameProperty;
  return (error as { constructor?: { name?: string } } | null)?.constructor?.name ?? "Unknown";
}

/**
 * Content-free diagnostic detail extracted from an `openai` SDK error (or anything else the
 * `chat.completions.create` call might throw, e.g. a token-acquisition failure). Never includes
 * `message`, request/response bodies, prompts or headers.
 */
export function describeOpenAiError(error: unknown): UpstreamErrorDetail {
  const detail: UpstreamErrorDetail = { errorName: resolveErrorName(error) };

  const shape = error as ApiErrorShape;
  if (typeof shape?.status === "number") detail.status = shape.status;
  if (typeof shape?.code === "string") detail.code = shape.code;
  if (typeof shape?.type === "string") detail.type = shape.type;
  if (typeof shape?.param === "string") detail.param = shape.param;

  const innerCode = shape?.error?.innererror?.code;
  if (shape?.code === "content_filter" || innerCode === "ResponsibleAIPolicyViolation") {
    detail.contentFilter = true;
    if (typeof innerCode === "string") detail.innerCode = innerCode;
    const categories = filteredCategories(shape?.error?.innererror?.content_filter_result);
    if (categories !== "") detail.filteredCategories = categories;
  }

  return detail;
}

/** Classifies any error from `chat.completions.create` into a stable UpstreamError. */
export function toUpstreamError(error: unknown): UpstreamError {
  const detail = describeOpenAiError(error);
  if (detail.contentFilter === true) {
    return new UpstreamError(
      "llm-content-filtered",
      "Azure OpenAI content filter blocked the request",
      detail,
    );
  }
  return new UpstreamError("llm-unavailable", "Azure OpenAI request failed", detail);
}

export interface AzureOpenAiChatClientOptions {
  endpoint: string;
  deployment: string;
  credential: TokenCredential;
  timeoutMs?: number;
  apiVersion?: string;
}

/** ChatClient over the Azure OpenAI SDK, authenticated with Entra ID (no API key). */
export function createAzureOpenAiChatClient(options: AzureOpenAiChatClientOptions): ChatClient {
  const client = new AzureOpenAI({
    endpoint: options.endpoint,
    deployment: options.deployment,
    apiVersion: options.apiVersion ?? "2024-10-21",
    azureADTokenProvider: getBearerTokenProvider(
      options.credential,
      "https://cognitiveservices.azure.com/.default",
    ),
    timeout: options.timeoutMs ?? 20_000,
    maxRetries: 0,
  });

  return {
    complete: async (request) => {
      try {
        const completion = await client.chat.completions.create({
          model: options.deployment,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          max_completion_tokens: request.maxOutputTokens,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.jsonSchema.name,
              strict: request.jsonSchema.strict,
              schema: request.jsonSchema.schema,
            },
          },
        });
        return {
          content: completion.choices[0]?.message.content ?? "",
          ...(completion.usage
            ? {
                usage: {
                  inputTokens: completion.usage.prompt_tokens,
                  outputTokens: completion.usage.completion_tokens,
                },
              }
            : {}),
        };
      } catch (error) {
        throw toUpstreamError(error);
      }
    },
  };
}
