import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UpstreamError, type Chunk } from "@kb/core";
import { maskPii } from "@kb/governance";
import { MockLlmProvider, type LlmProvider } from "@kb/llm-providers";
import type { Retriever } from "@kb/retrievers";
import {
  allAttributeValues,
  installTestTelemetry,
  type TestTelemetry,
} from "@kb/test-support/otel";
import { handleAsk, type AskDependencies } from "./handle-ask.js";

const QUESTION = "Qual o valor do auxílio home office? Meu email é ana@example.com";
const DOC_TEXT = "A empresa paga auxílio home office de R$ 150,00 por mês.";
const chunk: Chunk = {
  id: "item-1#1",
  docId: "item-1",
  title: "politica-home-office",
  url: "https://contoso.sharepoint.com/sites/kb-demo/Politicas/politica-home-office.docx",
  text: DOC_TEXT,
  score: 2,
};
const body = {
  question: QUESTION,
  page: {
    url: "https://contoso.sharepoint.com/sites/kb-demo/SitePages/Home.aspx",
    title: "Home",
    siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  },
};

/** Mock answers plus token usage, as Azure OpenAI reports it. */
function withUsage(mock: MockLlmProvider): LlmProvider {
  return {
    promptVersion: mock.promptVersion,
    generate: async (input) => ({
      ...(await mock.generate(input)),
      usage: { inputTokens: 900, outputTokens: 60 },
    }),
  };
}

function deps(retriever?: Retriever): AskDependencies {
  let clock = 0;
  const silent = () => undefined;
  return {
    validateToken: () =>
      Promise.resolve({
        ok: true,
        user: { objectId: "oid-a", name: "Test User A" },
        token: "user-token",
        roles: [],
      }),
    exchangeToken: () => Promise.resolve("graph-token"),
    retriever: retriever ?? {
      retrieve: () => Promise.resolve({ chunks: [chunk], documentCount: 1, documents: [] }),
    },
    provider: withUsage(new MockLlmProvider()),
    logger: { info: silent, warn: silent, error: silent },
    maskPii,
    newCorrelationId: () => "corr-1",
    now: () => (clock += 25),
  };
}

describe("handleAsk telemetry", () => {
  let telemetry: TestTelemetry;
  beforeAll(() => {
    telemetry = installTestTelemetry();
  });
  beforeEach(() => telemetry.reset());

  it("creates ask, pii.mask and grounding spans in a single trace", async () => {
    const res = await handleAsk({ authorization: "Bearer x", body }, deps());
    expect(res.status).toBe(200);

    const ask = telemetry.span("ask");
    const pii = telemetry.span("pii.mask");
    const grounding = telemetry.span("grounding");
    expect(ask.parentSpanContext).toBeUndefined();
    for (const child of [pii, grounding]) {
      expect(child.spanContext().traceId).toBe(ask.spanContext().traceId);
      expect(child.parentSpanContext?.spanId).toBe(ask.spanContext().spanId);
    }
    expect(ask.attributes).toMatchObject({
      "kb.correlation_id": "corr-1",
      "http.response.status_code": 200,
      "kb.refused": false,
      "kb.citations.count": 1,
    });
    expect(pii.attributes).toMatchObject({ "kb.pii.count": 1, "kb.pii.types": ["email"] });
    expect(grounding.attributes).toMatchObject({ "kb.citations.count": 1, "kb.refused": false });
  });

  it("never puts question, document or quote text in span attributes", async () => {
    await handleAsk({ authorization: "Bearer x", body }, deps());
    const values = allAttributeValues(telemetry.spans());
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      for (const fragment of ["home office", "auxílio", "ana@example.com", "150,00"]) {
        expect(value).not.toContain(fragment);
      }
    }
  });

  it("marks the ask span as an error on 5xx responses", async () => {
    const res = await handleAsk(
      { authorization: "Bearer x", body },
      deps({ retrieve: () => Promise.reject(new UpstreamError("upstream", "Graph down")) }),
    );
    expect(res.status).toBe(502);
    const ask = telemetry.span("ask");
    expect(ask.status.code).toBe(2);
    expect(ask.attributes["error.type"]).toBe("upstream");
  });

  it("records the pipeline metrics", async () => {
    await handleAsk({ authorization: "Bearer x", body }, deps());
    const names = await telemetry.metricNames();
    expect(names).toEqual(
      expect.arrayContaining([
        "retrieval.latency",
        "llm.latency",
        "llm.tokens",
        "answer.citations.count",
        "answer.refused",
      ]),
    );
  });
});
