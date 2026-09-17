import { describe, expect, it, vi } from "vitest";
import { UpstreamError, refusal, type Answer, type Chunk } from "@kb/core";
import { MockLlmProvider, type LlmProvider } from "@kb/llm-providers";
import type { Retriever } from "@kb/retrievers";
import type { TokenValidationResult } from "../auth/token-validator.js";
import { handleAsk, type AskDependencies, type AskLogger } from "./handle-ask.js";

const QUESTION = "Qual o valor do auxílio home office?";
const SECRET_DOC_TEXT = "A empresa paga auxílio home office de R$ 150,00 por mês.";
const validBody = {
  question: `  ${QUESTION}  `,
  page: {
    url: "https://contoso.sharepoint.com/sites/kb-demo/SitePages/Home.aspx",
    title: "Home",
    siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  },
};
const chunk: Chunk = {
  id: "item-1#1",
  docId: "item-1",
  title: "politica-home-office",
  url: "https://contoso.sharepoint.com/sites/kb-demo/Politicas/politica-home-office.docx",
  text: SECRET_DOC_TEXT,
  score: 2,
};

interface LogEntry {
  level: "info" | "warn" | "error";
  event: string;
  data: Record<string, unknown>;
}

function setup(
  overrides: {
    auth?: TokenValidationResult;
    exchangeToken?: AskDependencies["exchangeToken"];
    retriever?: Retriever;
    provider?: LlmProvider;
  } = {},
) {
  const logs: LogEntry[] = [];
  const logger: AskLogger = {
    info: (event, data) => logs.push({ level: "info", event, data }),
    warn: (event, data) => logs.push({ level: "warn", event, data }),
    error: (event, data) => logs.push({ level: "error", event, data }),
  };
  let clock = 1_000;
  const provider = overrides.provider ?? new MockLlmProvider();
  const generate = vi.spyOn(provider, "generate");
  const exchangeToken = overrides.exchangeToken ?? vi.fn(() => Promise.resolve("graph-token"));
  const retriever: Retriever = overrides.retriever ?? {
    retrieve: vi.fn(() => Promise.resolve({ chunks: [chunk], documentCount: 1 })),
  };
  const deps: AskDependencies = {
    validateToken: () =>
      Promise.resolve(
        overrides.auth ?? {
          ok: true,
          user: { objectId: "oid-a", name: "Test User A" },
          token: "user-token",
        },
      ),
    exchangeToken,
    retriever,
    provider,
    logger,
    newCorrelationId: () => "corr-1",
    now: () => (clock += 25),
  };
  return { deps, logs, generate, exchangeToken, retriever };
}

describe("handleAsk", () => {
  it("exchanges the user token, retrieves with it, generates and grounds the answer", async () => {
    const { deps, logs, exchangeToken, retriever } = setup();
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(200);
    expect(exchangeToken).toHaveBeenCalledWith("user-token", "oid-a");
    expect(retriever.retrieve).toHaveBeenCalledWith({
      question: QUESTION,
      graphToken: "graph-token",
    });
    const answer = res.jsonBody as Answer;
    expect(answer.refused).toBe(false);
    expect(answer.citations).toEqual([
      {
        chunkId: "item-1#1",
        quote: SECRET_DOC_TEXT.slice(0, 80),
        title: "politica-home-office",
        url: chunk.url,
      },
    ]);
    expect(logs).toContainEqual({
      level: "info",
      event: "ask.completed",
      data: {
        correlationId: "corr-1",
        status: 200,
        questionLength: QUESTION.length,
        durationMs: 25,
        promptVersion: "mock",
        documentCount: 1,
        chunkCount: 1,
        contextChars: SECRET_DOC_TEXT.length,
        citationCount: 1,
        refused: false,
      },
    });
  });

  it("refuses without calling the model when nothing relevant is retrieved", async () => {
    const { deps, generate } = setup({
      retriever: { retrieve: () => Promise.resolve({ chunks: [], documentCount: 0 }) },
    });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual(refusal("mock"));
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses when every citation is invented", async () => {
    const inventing: LlmProvider = {
      promptVersion: "v1",
      generate: () =>
        Promise.resolve({
          draft: {
            text: "Inventado",
            citations: [{ chunkId: "nope#0", quote: "x" }],
            refused: false,
            promptVersion: "v1",
          },
        }),
    };
    const { deps } = setup({ provider: inventing });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    expect(res.jsonBody).toEqual(refusal("v1"));
  });

  it("returns 401 without calling dependencies when the token is invalid", async () => {
    const { deps, logs, exchangeToken } = setup({ auth: { ok: false, reason: "wrong-tenant" } });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    expect(res.status).toBe(401);
    expect(res.jsonBody).toEqual({ error: "unauthorized", correlationId: "corr-1" });
    expect(exchangeToken).not.toHaveBeenCalled();
    expect(logs).toContainEqual({
      level: "warn",
      event: "ask.unauthorized",
      data: { correlationId: "corr-1", reason: "wrong-tenant" },
    });
  });

  it.each([
    ["empty question", { ...validBody, question: "   " }, "question"],
    ["question too long", { ...validBody, question: "x".repeat(1001) }, "question"],
    ["missing page", { question: QUESTION }, "page"],
    ["non-object body", undefined, ""],
  ])("returns 400 for %s", async (_label, body, field) => {
    const { deps } = setup();
    const res = await handleAsk({ authorization: "Bearer x", body }, deps);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: "invalid-request", field, correlationId: "corr-1" });
  });

  it.each([
    ["consent-required", 403, "consent-required"],
    ["upstream", 502, "upstream-unavailable"],
    ["llm-unavailable", 503, "upstream-unavailable"],
    ["llm-invalid-output", 502, "invalid-model-output"],
  ] as const)("maps %s to %i", async (kind, status, error) => {
    const { deps, logs } = setup({
      exchangeToken: () => Promise.reject(new UpstreamError(kind, "failure")),
    });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    expect(res.status).toBe(status);
    expect(res.jsonBody).toEqual({ error, correlationId: "corr-1" });
    expect(logs).toContainEqual({
      level: "warn",
      event: "ask.upstream-failed",
      data: { correlationId: "corr-1", kind, durationMs: 25 },
    });
  });

  it("returns 500 with correlation id for unexpected errors", async () => {
    const { deps, logs } = setup({
      retriever: { retrieve: () => Promise.reject(new TypeError("boom at secret/path.ts:12")) },
    });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ error: "internal-error", correlationId: "corr-1" });
    expect(logs).toContainEqual({
      level: "error",
      event: "ask.failed",
      data: { correlationId: "corr-1", errorName: "TypeError", durationMs: 25 },
    });
  });

  it("never logs question, document or answer text", async () => {
    const { deps, logs } = setup();
    await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(QUESTION);
    expect(serialized).not.toContain("R$ 150,00");
    expect(serialized).not.toContain("Olá");
  });
});
