import {
  enforceGrounding,
  isUpstreamError,
  markSpanError,
  refusal,
  withSpan,
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
import type { Span } from "@opentelemetry/api";
import type { LlmProvider, TokenUsage } from "@kb/llm-providers";
import type { Retriever } from "@kb/retrievers";
import type { TokenExchanger } from "../auth/obo.js";
import type { TokenValidator } from "../auth/token-validator.js";
import { recordAskMetrics } from "./metrics.js";
import { askRequestSchema } from "./request-schema.js";
import {
  selectVariant,
  type PromptVersion,
  type RetrieverName,
  type SelectionDefaults,
} from "./selection.js";

export interface AskHttpRequest {
  authorization: string | undefined;
  body: unknown;
  /** Used only for the evaluator-only variant headers; see selection.ts. */
  headers?: Record<string, string | undefined>;
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
  retrievers: Record<RetrieverName, Retriever>;
  providers: Record<PromptVersion, LlmProvider>;
  /** Configured defaults; evaluator callers may override them per request. */
  defaults: SelectionDefaults;
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
 * Logs, span attributes and metrics carry metadata only: question, document and answer text
 * never leave the request.
 */
export function handleAsk(
  request: AskHttpRequest,
  deps: AskDependencies,
): Promise<AskHttpResponse> {
  return withSpan("ask", {}, (span) => ask(request, deps, span));
}

async function ask(
  request: AskHttpRequest,
  deps: AskDependencies,
  span: Span,
): Promise<AskHttpResponse> {
  const correlationId = deps.newCorrelationId();
  span.setAttribute("kb.correlation_id", correlationId);
  const startedAt = deps.now();
  const respond = (
    status: AskHttpResponse["status"],
    jsonBody: unknown,
    errorType?: string,
  ): AskHttpResponse => {
    span.setAttribute("http.response.status_code", status);
    if (status >= 500) markSpanError(span, errorType ?? "internal-error");
    return { status, headers: { "x-correlation-id": correlationId }, jsonBody };
  };

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

  const isEvaluator = auth.roles.includes(EVALUATOR_ROLE);
  const selection = selectVariant(request.headers ?? {}, isEvaluator, deps.defaults);
  if (!selection.ok) {
    deps.logger.warn("ask.invalid-request", { correlationId, field: selection.field });
    return respond(400, { error: "invalid-request", field: selection.field, correlationId });
  }
  const retriever = deps.retrievers[selection.retriever];
  const provider = deps.providers[selection.prompt];
  span.setAttribute("kb.retriever", selection.retriever);

  const { question: rawText, page: rawPage } = parsed.data;
  const page: PageContext = {
    url: rawPage.url,
    title: rawPage.title,
    siteUrl: rawPage.siteUrl,
    ...(rawPage.listTitle !== undefined ? { listTitle: rawPage.listTitle } : {}),
  };

  try {
    const pii = await withSpan("pii.mask", {}, async (piiSpan) => {
      const result = deps.maskPii(rawText);
      const count = result.findings.reduce((sum, finding) => sum + finding.count, 0);
      piiSpan.setAttribute("kb.pii.count", count);
      piiSpan.setAttribute(
        "kb.pii.types",
        result.findings.map((finding) => finding.type),
      );
      return result;
    });
    const text = pii.masked;
    const question: Question = { text, page };

    const graphToken = await deps.exchangeToken(auth.token, auth.user.objectId);
    const oboDone = deps.now();
    const { chunks, documentCount, documents } = await retriever.retrieve({
      question: text,
      graphToken,
    });
    const retrievalDone = deps.now();

    let answer: Answer;
    let usage: TokenUsage | undefined;
    let refusalReason: RefusalReason | undefined;
    let upstreamDetail: UpstreamErrorDetail | undefined;

    if (chunks.length === 0) {
      answer = refusal(provider.promptVersion);
      refusalReason = "no-relevant-documents";
    } else {
      try {
        const result = await provider.generate({
          question,
          user: { name: auth.user.name },
          chunks,
        });
        usage = result.usage;
        const draft = result.draft;
        answer = await withSpan("grounding", {}, async (groundingSpan) => {
          const grounded = enforceGrounding(draft, chunks);
          groundingSpan.setAttribute("kb.citations.count", grounded.citations.length);
          groundingSpan.setAttribute("kb.refused", grounded.refused);
          return grounded;
        });
        if (answer.refused) refusalReason = "ungrounded";
      } catch (error) {
        if (isUpstreamError(error) && error.kind === "llm-content-filtered") {
          answer = refusal(provider.promptVersion);
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

    span.setAttribute("kb.prompt.version", answer.promptVersion);
    span.setAttribute("kb.refused", answer.refused);
    span.setAttribute("kb.citations.count", answer.citations.length);
    span.setAttribute("kb.pii.count", piiCount);
    if (refusalReason) span.setAttribute("kb.refusal.reason", refusalReason);
    recordAskMetrics({
      retrievalMs: retrievalDone - oboDone,
      ...(chunks.length > 0 ? { generationMs: generationDone - retrievalDone } : {}),
      ...(usage ? { usage } : {}),
      citations: answer.citations.length,
      ...(refusalReason ? { refusalReason } : {}),
    });

    deps.logger.info("ask.completed", {
      correlationId,
      status: 200,
      questionLength: rawText.length,
      retriever: selection.retriever,
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
    if (isEvaluator) {
      const diagnostics: Diagnostics = {
        promptVersion: answer.promptVersion,
        retriever: selection.retriever,
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
      return respond(mapped.status, { error: mapped.error, correlationId }, error.kind);
    }
    deps.logger.error("ask.failed", {
      correlationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: deps.now() - startedAt,
    });
    return respond(500, { error: "internal-error", correlationId });
  }
}
