import type { AskRequest, AskResponse } from "../contract";
import type { AskErrorKind } from "./messages";
import { newTraceparent as defaultTraceparent } from "./traceparent";

export interface HttpPoster {
  post(
    url: string,
    init: { headers: Record<string, string>; body: string },
  ): Promise<{ status: number; json(): Promise<unknown> }>;
}

/** Errors carry the W3C trace id sent with the request, so users can quote it to support. */
export type AskResult =
  { ok: true; answer: AskResponse } | { ok: false; error: AskErrorKind; traceId: string };

export interface AskClient {
  ask(request: AskRequest): Promise<AskResult>;
}

export interface KnowledgeApiClientOptions {
  baseUrl: string;
  /** Resolves the AAD-authenticated HTTP client; rejects when the API permission is not usable. */
  getHttp: () => Promise<HttpPoster>;
  timeoutMs?: number;
  newTraceparent?: () => string;
}

export const DEFAULT_TIMEOUT_MS = 45000;

const TIMEOUT = Symbol("timeout");
const TOKEN_ERROR = /AADSTS|consent_required|interaction_required|login_required|TokenRenewal/i;

/** 403 means the API cannot act for the user (consent); unlisted statuses fall back to server-error. */
function statusToError(status: number): AskErrorKind {
  if (status === 400) return "invalid-request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "not-configured";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "server-error";
}

export class KnowledgeApiClient implements AskClient {
  private readonly options: KnowledgeApiClientOptions;

  public constructor(options: KnowledgeApiClientOptions) {
    this.options = options;
  }

  public async ask(request: AskRequest): Promise<AskResult> {
    const traceparent = (this.options.newTraceparent ?? defaultTraceparent)();
    const traceId = traceparent.split("-")[1] ?? "";
    const fail = (error: AskErrorKind): AskResult => ({ ok: false, error, traceId });

    let http: HttpPoster;
    try {
      http = await this.options.getHttp();
    } catch {
      return fail("not-configured");
    }

    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
    });

    let response: { status: number; json(): Promise<unknown> } | typeof TIMEOUT;
    try {
      response = await Promise.race([
        http.post(`${this.options.baseUrl.replace(/\/$/, "")}/api/ask`, {
          headers: {
            "Content-Type": "application/json",
            traceparent,
          },
          body: JSON.stringify(request),
        }),
        timeout,
      ]);
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      return fail(TOKEN_ERROR.test(message) ? "not-configured" : "unavailable");
    }
    clearTimeout(timer);

    if (response === TIMEOUT) return fail("unavailable");
    if (response.status === 502) {
      const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
      if (body?.error === "invalid-model-output") return fail("server-error");
    }
    if (response.status !== 200) return fail(statusToError(response.status));

    try {
      return { ok: true, answer: (await response.json()) as AskResponse };
    } catch {
      return fail("server-error");
    }
  }
}
