import { describe, expect, it, vi } from "vitest";
import { KnowledgeApiClient, type HttpPoster } from "../src/api/KnowledgeApiClient";
import { errorMessages } from "../src/api/messages";
import { newTraceparent } from "../src/api/traceparent";
import type { AskRequest, AskResponse } from "../src/contract";

const request: AskRequest = {
  question: "Qual o valor do auxílio?",
  page: {
    url: "https://contoso.sharepoint.com/sites/kb-demo",
    title: "Home",
    siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  },
};
const answer: AskResponse = { text: "ok", citations: [], refused: false, promptVersion: "mock" };

function poster(
  response: { status: number; body?: unknown } | Error,
): HttpPoster & { calls: Parameters<HttpPoster["post"]>[] } {
  const calls: Parameters<HttpPoster["post"]>[] = [];
  return {
    calls,
    post: (url, init) => {
      calls.push([url, init]);
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve({
        status: response.status,
        json: () => Promise.resolve(response.body),
      });
    },
  };
}

const client = (http: HttpPoster | Promise<HttpPoster>, timeoutMs = 30_000) =>
  new KnowledgeApiClient({
    baseUrl: "https://api.example.net",
    getHttp: () => Promise.resolve(http),
    timeoutMs,
    newTraceparent: () => "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
  });

describe("KnowledgeApiClient", () => {
  it("posts JSON with traceparent to /api/ask and returns the answer", async () => {
    const http = poster({ status: 200, body: answer });
    const result = await client(http).ask(request);

    expect(result).toEqual({ ok: true, answer });
    expect(http.calls).toHaveLength(1);
    const [url, init] = http.calls[0]!;
    expect(url).toBe("https://api.example.net/api/ask");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    });
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it.each([
    [400, "invalid-request"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [500, "server-error"],
    [502, "unavailable"],
    [503, "unavailable"],
    [504, "unavailable"],
    [404, "server-error"],
  ] as const)("maps HTTP %i to %s", async (status, error) => {
    expect(await client(poster({ status })).ask(request)).toEqual({ ok: false, error });
  });

  it("maps a network failure to unavailable", async () => {
    expect(await client(poster(new TypeError("Failed to fetch"))).ask(request)).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("maps a token acquisition failure during post to not-configured", async () => {
    const http = poster(new Error("AADSTS65001: The user or administrator has not consented"));
    expect(await client(http).ask(request)).toEqual({ ok: false, error: "not-configured" });
  });

  it("maps a failure to create the AAD client to not-configured", async () => {
    const failing = new KnowledgeApiClient({
      baseUrl: "https://api.example.net",
      getHttp: () => Promise.reject(new Error("no")),
    });
    expect(await failing.ask(request)).toEqual({ ok: false, error: "not-configured" });
  });

  it("times out as unavailable", async () => {
    vi.useFakeTimers();
    const hanging: HttpPoster = { post: () => new Promise(() => undefined) };
    const pending = client(hanging, 30_000).ask(request);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ ok: false, error: "unavailable" });
    vi.useRealTimers();
  });
});

describe("messages and traceparent", () => {
  it("has the exact pt-BR messages", () => {
    expect(errorMessages).toEqual({
      unauthorized: "Não foi possível autenticar. Recarregue a página.",
      "invalid-request": "Escreva uma pergunta de até 1.000 caracteres.",
      "server-error": "O assistente teve um problema. Tente de novo.",
      unavailable: "Assistente indisponível no momento.",
      "not-configured": "Assistente não configurado neste site.",
    });
  });

  it("generates W3C traceparent values", () => {
    const value = newTraceparent();
    expect(value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(newTraceparent()).not.toBe(value);
  });
});
