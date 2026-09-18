import { metrics, SpanStatusCode, trace, type Meter, type Span } from "@opentelemetry/api";
import { isUpstreamError } from "./errors.js";

/** Instrumentation scope for every span and metric emitted by the knowledge pipeline. */
export const TELEMETRY_SCOPE = "knowledge-api";

export type SpanAttributes = Record<string, string | number | boolean | string[]>;

/**
 * Runs `fn` inside an active span, so nested spans share its trace.
 * Attributes must be metadata only: question, document, quote and answer text never go here.
 * Failures record the upstream kind or error name (never the message) and set an error status.
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return trace.getTracer(TELEMETRY_SCOPE).startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      markSpanError(
        span,
        isUpstreamError(error) ? error.kind : error instanceof Error ? error.name : "UnknownError",
      );
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Marks a span as failed without throwing (for handled failures such as 5xx responses). */
export function markSpanError(span: Span, errorType: string): void {
  span.setAttribute("error.type", errorType);
  span.setStatus({ code: SpanStatusCode.ERROR });
}

/** Resolved on every call so a meter provider registered after module load is honored. */
export function telemetryMeter(): Meter {
  return metrics.getMeter(TELEMETRY_SCOPE);
}
