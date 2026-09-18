import { telemetryMeter, type RefusalReason } from "@kb/core";
import type { TokenUsage } from "@kb/llm-providers";

export interface AskMetrics {
  retrievalMs: number;
  /** Absent when the model was not called (nothing relevant retrieved). */
  generationMs?: number;
  usage?: TokenUsage;
  citations: number;
  refusalReason?: RefusalReason;
}

/** Pipeline metrics for a completed /api/ask call; instruments hold no text, only numbers. */
export function recordAskMetrics(values: AskMetrics): void {
  const meter = telemetryMeter();
  meter
    .createHistogram("retrieval.latency", { unit: "ms", description: "Graph retrieval duration" })
    .record(values.retrievalMs);
  if (values.generationMs !== undefined) {
    meter
      .createHistogram("llm.latency", {
        unit: "ms",
        description: "Azure OpenAI generation duration",
      })
      .record(values.generationMs);
  }
  if (values.usage) {
    const tokens = meter.createCounter("llm.tokens", { description: "Azure OpenAI tokens" });
    tokens.add(values.usage.inputTokens, { "gen_ai.token.type": "input" });
    tokens.add(values.usage.outputTokens, { "gen_ai.token.type": "output" });
  }
  meter
    .createCounter("answer.citations.count", { description: "Citations returned in answers" })
    .add(values.citations);
  meter
    .createCounter("answer.refused", { description: "Answers refused, by reason" })
    .add(
      values.refusalReason ? 1 : 0,
      values.refusalReason ? { "kb.refusal.reason": values.refusalReason } : {},
    );
}
