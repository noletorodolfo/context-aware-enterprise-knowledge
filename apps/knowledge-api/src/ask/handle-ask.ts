import {
  enforceGrounding,
  isUpstreamError,
  refusal,
  type Answer,
  type PageContext,
  type Question,
  type UpstreamErrorKind,
} from "@kb/core";
import type { LlmProvider, TokenUsage } from "@kb/llm-providers";
import type { Retriever } from "@kb/retrievers";
import type { TokenExchanger } from "../auth/obo.js";
import type { TokenValidator } from "../auth/token-validator.js";
import { askRequestSchema } from "./request-schema.js";

export interface AskHttpRequest {
  authorization: string | undefined;
  body: unknown;
}

export interface AskHttpResponse {
  status: 200 | 400 | 401 | 403 | 500 | 502 | 503;
  headers: Record<string, string>;
  jsonBody: unknown;
}

export interface AskLogger {
  info(event: string, data: Record<string, unknown>): void;
  warn(event: string, data: Record<string, unknown>): void;
  error(event: string, data: Record<string, unknown>): void;
}

export interface AskDependencies {
  validateToken: TokenValidator;
  exchangeToken: TokenExchanger;
  retriever: Retriever;
  provider: LlmProvider;
  logger: AskLogger;
  newCorrelationId: () => string;
  now: () => number;
}

const UPSTREAM_RESPONSES: Record<
  UpstreamErrorKind,
  { status: AskHttpResponse["status"]; error: string }
> = {
  "consent-required": { status: 403, error: "consent-required" },
  upstream: { status: 502, error: "upstream-unavailable" },
  "llm-unavailable": { status: 503, error: "upstream-unavailable" },
  "llm-invalid-output": { status: 502, error: "invalid-model-output" },
};

/**
 * POST /api/ask, independent of the Azure Functions runtime.
 * Logs carry metadata only: question, document and answer text are never logged.
 */
export async function handleAsk(
  request: AskHttpRequest,
  deps: AskDependencies,
): Promise<AskHttpResponse> {
  const correlationId = deps.newCorrelationId();
  const startedAt = deps.now();
  const respond = (status: AskHttpResponse["status"], jsonBody: unknown): AskHttpResponse => ({
    status,
    headers: { "x-correlation-id": correlationId },
    jsonBody,
  });

  const auth = await deps.validateToken(request.authorization);
  if (!auth.ok) {
    deps.logger.warn("ask.unauthorized", { correlationId, reason: auth.reason });
    return respond(401, { error: "unauthorized", correlationId });
  }

  const parsed = askRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? "";
    deps.logger.warn("ask.invalid-request", { correlationId, field });
    return respond(400, { error: "invalid-request", field, correlationId });
  }

  const { question: text, page: rawPage } = parsed.data;
  const page: PageContext = {
    url: rawPage.url,
    title: rawPage.title,
    siteUrl: rawPage.siteUrl,
    ...(rawPage.listTitle !== undefined ? { listTitle: rawPage.listTitle } : {}),
  };
  const question: Question = { text, page };

  try {
    const graphToken = await deps.exchangeToken(auth.token, auth.user.objectId);
    const { chunks, documentCount } = await deps.retriever.retrieve({ question: text, graphToken });

    let answer: Answer;
    let usage: TokenUsage | undefined;
    if (chunks.length === 0) {
      answer = refusal(deps.provider.promptVersion);
    } else {
      const result = await deps.provider.generate({
        question,
        user: { name: auth.user.name },
        chunks,
      });
      usage = result.usage;
      answer = enforceGrounding(result.draft, chunks);
    }

    deps.logger.info("ask.completed", {
      correlationId,
      status: 200,
      questionLength: text.length,
      durationMs: deps.now() - startedAt,
      promptVersion: answer.promptVersion,
      documentCount,
      chunkCount: chunks.length,
      contextChars: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
      citationCount: answer.citations.length,
      refused: answer.refused,
      ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : {}),
    });
    return respond(200, answer);
  } catch (error) {
    if (isUpstreamError(error)) {
      const mapped = UPSTREAM_RESPONSES[error.kind];
      deps.logger.warn("ask.upstream-failed", {
        correlationId,
        kind: error.kind,
        durationMs: deps.now() - startedAt,
      });
      return respond(mapped.status, { error: mapped.error, correlationId });
    }
    deps.logger.error("ask.failed", {
      correlationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: deps.now() - startedAt,
    });
    return respond(500, { error: "internal-error", correlationId });
  }
}
