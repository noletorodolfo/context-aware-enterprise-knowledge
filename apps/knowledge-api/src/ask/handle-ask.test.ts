import { describe, expect, it } from "vitest";
import type { Answer } from "@kb/core";
import { MockLlmProvider, type LlmProvider } from "@kb/llm-providers";
import type { TokenValidationResult } from "../auth/token-validator.js";
import { handleAsk, type AskDependencies, type AskLogger } from "./handle-ask.js";

const QUESTION = "Qual o valor do auxílio home office?";
const validBody = {
  question: `  ${QUESTION}  `,
  page: {
    url: "https://contoso.sharepoint.com/sites/kb-demo/SitePages/Home.aspx",
    title: "Home",
    siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  },
};

interface LogEntry {
  level: "info" | "warn" | "error";
  event: string;
  data: Record<string, unknown>;
}

function setup(overrides: { auth?: TokenValidationResult; provider?: LlmProvider } = {}) {
  const logs: LogEntry[] = [];
  const logger: AskLogger = {
    info: (event, data) => logs.push({ level: "info", event, data }),
    warn: (event, data) => logs.push({ level: "warn", event, data }),
    error: (event, data) => logs.push({ level: "error", event, data }),
  };
  let clock = 1_000;
  const deps: AskDependencies = {
    validateToken: () =>
      Promise.resolve(
        overrides.auth ?? { ok: true, user: { objectId: "oid-a", name: "Test User A" } },
      ),
    provider: overrides.provider ?? new MockLlmProvider(),
    logger,
    newCorrelationId: () => "corr-1",
    now: () => (clock += 25),
  };
  return { deps, logs };
}

describe("handleAsk", () => {
  it("returns the provider answer for an authenticated, valid request", async () => {
    const { deps, logs } = setup();
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(200);
    expect(res.headers["x-correlation-id"]).toBe("corr-1");
    const answer = res.jsonBody as Answer;
    expect(answer.text).toContain("Test User A");
    expect(answer.text).toContain(`"${QUESTION}"`);
    expect(answer.text).toContain("Home");
    expect(logs).toContainEqual({
      level: "info",
      event: "ask.completed",
      data: {
        correlationId: "corr-1",
        status: 200,
        questionLength: QUESTION.length,
        durationMs: 25,
        promptVersion: "mock",
      },
    });
  });

  it("returns 401 without details and logs the reason", async () => {
    const { deps, logs } = setup({ auth: { ok: false, reason: "wrong-tenant" } });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(401);
    expect(res.jsonBody).toEqual({ error: "unauthorized", correlationId: "corr-1" });
    expect(logs).toContainEqual({
      level: "warn",
      event: "ask.unauthorized",
      data: { correlationId: "corr-1", reason: "wrong-tenant" },
    });
  });

  it("checks authentication before reading the body", async () => {
    const { deps } = setup({ auth: { ok: false, reason: "missing-token" } });
    const res = await handleAsk({ authorization: undefined, body: "not json" }, deps);
    expect(res.status).toBe(401);
  });

  it.each([
    ["empty question", { ...validBody, question: "   " }, "question"],
    ["question too long", { ...validBody, question: "x".repeat(1001) }, "question"],
    ["missing page", { question: QUESTION }, "page"],
    [
      "invalid page url",
      { ...validBody, page: { ...validBody.page, url: "not a url" } },
      "page.url",
    ],
    ["non-object body", undefined, ""],
  ])("returns 400 for %s", async (_label, body, field) => {
    const { deps } = setup();
    const res = await handleAsk({ authorization: "Bearer x", body }, deps);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: "invalid-request", field, correlationId: "corr-1" });
  });

  it("accepts exactly 1000 characters", async () => {
    const { deps } = setup();
    const res = await handleAsk(
      { authorization: "Bearer x", body: { ...validBody, question: "x".repeat(1000) } },
      deps,
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 with correlation id and no stack when the provider throws", async () => {
    const failing: LlmProvider = {
      generate: () => Promise.reject(new TypeError("boom at secret/path.ts:12")),
    };
    const { deps, logs } = setup({ provider: failing });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ error: "internal-error", correlationId: "corr-1" });
    expect(logs).toContainEqual({
      level: "error",
      event: "ask.failed",
      data: { correlationId: "corr-1", errorName: "TypeError", durationMs: 25 },
    });
  });

  it("never writes the question or answer text to logs", async () => {
    const { deps, logs } = setup();
    await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(QUESTION);
    expect(serialized).not.toContain("Olá");
  });
});
