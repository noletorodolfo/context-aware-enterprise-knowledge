import type { PageContext, Question } from "@kb/core";
import type { LlmProvider } from "@kb/llm-providers";
import type { TokenValidator } from "../auth/token-validator.js";
import { askRequestSchema } from "./request-schema.js";

export interface AskHttpRequest {
  authorization: string | undefined;
  body: unknown;
}

export interface AskHttpResponse {
  status: 200 | 400 | 401 | 500;
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
  provider: LlmProvider;
  logger: AskLogger;
  newCorrelationId: () => string;
  now: () => number;
}

/**
 * POST /api/ask, independent of the Azure Functions runtime.
 * Logs carry metadata only: question and answer text are never logged.
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
    const answer = await deps.provider.generate({ question, user: { name: auth.user.name } });
    deps.logger.info("ask.completed", {
      correlationId,
      status: 200,
      questionLength: text.length,
      durationMs: deps.now() - startedAt,
      promptVersion: answer.promptVersion,
    });
    return respond(200, answer);
  } catch (error) {
    deps.logger.error("ask.failed", {
      correlationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: deps.now() - startedAt,
    });
    return respond(500, { error: "internal-error", correlationId });
  }
}
