import { UpstreamError, withSpan } from "@kb/core";

export type AppTokenProvider = () => Promise<string>;

export interface AppTokenOptions {
  tenantId: string;
  clientId: string;
  /** Resource scope, e.g. `https://graph.microsoft.com/.default`. */
  scope: string;
  createAssertion: () => Promise<string>;
  fetchFn?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  error_codes?: number[];
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * Client credentials grant for app-only access, proven by a certificate assertion rather than a
 * secret. Ingestion runs with no user present, so this token carries application permissions that
 * are deliberately narrower than what a user could reach: `Sites.Selected`, granted per site.
 * The token is cached in memory and never logged or persisted.
 */
export function createAppTokenProvider(options: AppTokenOptions): AppTokenProvider {
  const now = options.now ?? Date.now;
  const fetchFn = options.fetchFn ?? fetch;
  let cached: { token: string; expiresAt: number } | undefined;
  let inFlight: Promise<string> | undefined;

  return () =>
    withSpan("entra.app-token", { "kb.scope": options.scope }, async (span) => {
      const hit = !!cached && cached.expiresAt - REFRESH_MARGIN_MS > now();
      span.setAttribute("kb.token.cache_hit", hit);
      if (cached && hit) return cached.token;
      // One request at a time: a burst of queue messages must not open one token request each.
      inFlight ??= request().finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    });

  async function request(): Promise<string> {
    let assertion: string;
    try {
      assertion = await options.createAssertion();
    } catch (error) {
      throw new UpstreamError("upstream", "Client assertion could not be signed", {
        stage: "assertion",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    let response: Response;
    try {
      response = await fetchFn(
        `https://login.microsoftonline.com/${options.tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: options.clientId,
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: assertion,
            scope: options.scope,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        },
      );
    } catch (error) {
      throw new UpstreamError("upstream", "App token request failed", {
        stage: "app-token",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    const json = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !json.access_token) {
      throw new UpstreamError("upstream", `App token failed: ${json.error ?? response.status}`, {
        stage: "app-token",
        status: response.status,
        ...(json.error ? { oauthError: json.error } : {}),
        ...(json.error_codes?.length ? { aadstsCodes: json.error_codes.join(",") } : {}),
      });
    }

    cached = { token: json.access_token, expiresAt: now() + (json.expires_in ?? 0) * 1000 };
    return json.access_token;
  }
}
