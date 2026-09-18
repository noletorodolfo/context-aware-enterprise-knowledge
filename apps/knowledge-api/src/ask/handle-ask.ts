import {
  enforceGrounding,
  isUpstreamError,
  refusal,
  type Answer,
  type AskResponse,
  type Diagnostics,
  type PageContext,
  type Question,
  type RefusalReason,
  type UpstreamErrorDetail,
  type UpstreamErrorKind,
} from "@kb/core";
import type { PiiMaskResult } from "@kb/governance";
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
  maskPii: (text: string) => PiiMaskResult;
  newCorrelationId: () => string;
  now: () => number;
}

/** App role whose holders receive pipeline diagnostics (evaluation runs). */
export const EVALUATOR_ROLE = "Evaluator";

const UPSTREAM_RESPONSES: Record<
  Exclude<UpstreamErrorKind, "llm-content-filtered">,
  { status: AskHttpResponse["status"]; error: string }
> = {
  "consent-required": { status: 403, error: "consent-required" },
  upstream: { status: 502, error: "upstream-unavailable" },
  "llm-unavailable": { status: 503, error: "upstream-unavailable" },
  "llm-invalid-output": { status: 502, error: "invalid-model-output" },
};

/**
 * POST /api/ask, independent of the Azure Functions runtime.
 * Personal data is masked before any dependency sees the question (fail closed).
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

  const { question: rawText, page: rawPage } = parsed.data;
  const page: PageContext = {
    url: rawPage.url,
    title: rawPage.title,
    siteUrl: rawPage.siteUrl,
    ...(rawPage.listTitle !== undefined ? { listTitle: rawPage.listTitle } : {}),
  };

  try {
    const pii = deps.maskPii(rawText);
    const text = pii.masked;
    const question: Question = { text, page };

    const graphToken = await deps.exchangeToken(auth.token, auth.user.objectId);
    const oboDone = deps.now();
    const { chunks, documentCount, documents } = await deps.retriever.retrieve({
      question: text,
      graphToken,
    });
    const retrievalDone = deps.now();

    let answer: Answer;
    let usage: TokenUsage | undefined;
    let refusalReason: RefusalReason | undefined;
    let upstreamDetail: UpstreamErrorDetail | undefined;

    if (chunks.length === 0) {
      answer = refusal(deps.provider.promptVersion);
      refusalReason = "no-relevant-documents";
    } else {
      try {
        const result = await deps.provider.generate({
          question,
          user: { name: auth.user.name },
          chunks,
        });
        usage = result.usage;
        answer = enforceGrounding(result.draft, chunks);
        if (answer.refused) refusalReason = "ungrounded";
      } catch (error) {
        if (isUpstreamError(error) && error.kind === "llm-content-filtered") {
          answer = refusal(deps.provider.promptVersion);
          refusalReason = "content-filter";
          upstreamDetail = error.detail;
        } else {
          throw error;
        }
      }
    }
    const generationDone = deps.now();
    const finishedAt = deps.now();
    const piiCount = pii.findings.reduce((sum, finding) => sum + finding.count, 0);

    deps.logger.info("ask.completed", {
      correlationId,
      status: 200,
      questionLength: rawText.length,
      durationMs: finishedAt - startedAt,
      promptVersion: answer.promptVersion,
      documentCount,
      chunkCount: chunks.length,
      contextChars: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
      citationCount: answer.citations.length,
      refused: answer.refused,
      ...(refusalReason ? { refusalReason } : {}),
      ...(piiCount > 0 ? { piiTypes: pii.findings.map((f) => f.type), piiCount } : {}),
      ...(upstreamDetail?.status !== undefined ? { upstreamStatus: upstreamDetail.status } : {}),
      ...(upstreamDetail?.code !== undefined ? { upstreamCode: upstreamDetail.code } : {}),
      ...(upstreamDetail?.innerCode !== undefined
        ? { upstreamInnerCode: upstreamDetail.innerCode }
        : {}),
      ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : {}),
    });

    const body: AskResponse = { ...answer, piiMasked: piiCount > 0 };
    if (auth.roles.includes(EVALUATOR_ROLE)) {
      const diagnostics: Diagnostics = {
        promptVersion: answer.promptVersion,
        ...(refusalReason ? { refusalReason } : {}),
        pii: pii.findings,
        retrieval: {
          documents,
          chunks: chunks.map((chunk) => ({ id: chunk.id, docId: chunk.docId, score: chunk.score })),
        },
        timingsMs: {
          obo: oboDone - startedAt,
          retrieval: retrievalDone - oboDone,
          generation: generationDone - retrievalDone,
          total: finishedAt - startedAt,
        },
      };
      body.diagnostics = diagnostics;
    }
    return respond(200, body);
  } catch (error) {
    if (isUpstreamError(error)) {
      const mapped =
        UPSTREAM_RESPONSES[error.kind as Exclude<UpstreamErrorKind, "llm-content-filtered">];
      deps.logger.warn("ask.upstream-failed", {
        correlationId,
        kind: error.kind,
        durationMs: deps.now() - startedAt,
        ...(error.detail ?? {}),
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
