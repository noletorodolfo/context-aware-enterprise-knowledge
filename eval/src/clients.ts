import type { E2eConfig } from "@kb/test-support/e2e-config";
import type { EvalUser } from "./golden-set.js";

export interface AskOutcome {
  status: number;
  body: unknown;
  latencyMs: number;
}

export type AskClient = (user: EvalUser, question: string) => Promise<AskOutcome>;

export interface VariantOptions {
  /** Evaluator-only headers that pick the retriever and the prompt version. */
  retriever?: string;
  prompt?: string;
}

/** Calls the deployed API as test user A or B (tokens from the shared interactive sign-in). */
export function createApiClient(
  config: Pick<E2eConfig, "apiBaseUrl" | "siteUrl">,
  tokens: Record<EvalUser, string>,
  variant: VariantOptions = {},
  fetchFn: typeof fetch = fetch,
  timeoutMs = 60_000,
): AskClient {
  return async (user, question) => {
    const started = performance.now();
    const response = await fetchFn(`${config.apiBaseUrl.replace(/\/$/, "")}/api/ask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens[user]}`,
        "Content-Type": "application/json",
        ...(variant.retriever ? { "x-kb-retriever": variant.retriever } : {}),
        ...(variant.prompt ? { "x-kb-prompt": variant.prompt } : {}),
      },
      body: JSON.stringify({
        question,
        page: {
          url: `${config.siteUrl}/SitePages/Home.aspx`,
          title: "Eval",
          siteUrl: config.siteUrl,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body: unknown = await response.json().catch(() => undefined);
    return { status: response.status, body, latencyMs: performance.now() - started };
  };
}
