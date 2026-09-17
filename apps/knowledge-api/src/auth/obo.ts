import { UpstreamError } from "@kb/core";

export const GRAPH_DELEGATED_SCOPES = [
  "https://graph.microsoft.com/Sites.Read.All",
  "https://graph.microsoft.com/Files.Read.All",
];

export type TokenExchanger = (userToken: string, userKey: string) => Promise<string>;

export interface OboOptions {
  tenantId: string;
  clientId: string;
  scopes: string[];
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
 * On-Behalf-Of exchange of the caller's API token for a delegated Graph token.
 * Tokens are cached in memory per user (object id) and never persisted or logged.
 */
export function createOboExchanger(options: OboOptions): TokenExchanger {
  const cache = new Map<string, { token: string; expiresAt: number }>();
  const now = options.now ?? Date.now;
  const fetchFn = options.fetchFn ?? fetch;

  return async (userToken, userKey) => {
    const cached = cache.get(userKey);
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.token;

    let assertion: string;
    try {
      assertion = await options.createAssertion();
    } catch {
      throw new UpstreamError("upstream", "Client assertion could not be signed");
    }

    let response: Response;
    try {
      response = await fetchFn(
        `https://login.microsoftonline.com/${options.tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            client_id: options.clientId,
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: assertion,
            assertion: userToken,
            scope: options.scopes.join(" "),
            requested_token_use: "on_behalf_of",
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        },
      );
    } catch {
      throw new UpstreamError("upstream", "OBO request failed");
    }

    const json = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !json.access_token) {
      const consent =
        json.error === "interaction_required" ||
        (json.error_codes ?? []).includes(65001) ||
        /AADSTS65001/.test(json.error_description ?? "");
      throw new UpstreamError(
        consent ? "consent-required" : "upstream",
        `OBO failed: ${json.error ?? String(response.status)}`,
      );
    }

    cache.set(userKey, {
      token: json.access_token,
      expiresAt: now() + (json.expires_in ?? 0) * 1000,
    });
    return json.access_token;
  };
}
