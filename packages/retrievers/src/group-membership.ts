import { createHash } from "node:crypto";
import { UpstreamError } from "@kb/core";

const MEMBER_OF = "https://graph.microsoft.com/v1.0/me/memberOf?$select=id&$top=999";
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface GroupMembershipOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

/** Resolves the Entra group ids of the caller behind a delegated Graph token. */
export type GroupResolver = (graphToken: string) => Promise<string[]>;

interface MemberOfPage {
  value?: { id?: string }[];
  "@odata.nextLink"?: string;
}

/**
 * The search filter must describe the caller, never the request. Group ids therefore come from the
 * caller's own delegated token, cached briefly so a membership change takes effect within minutes.
 */
export function createGroupMembership(options: GroupMembershipOptions = {}): GroupResolver {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const cache = new Map<string, { groups: string[]; expiresAt: number }>();

  return async (graphToken) => {
    // The token itself is never used as a key, only an opaque digest of it.
    const key = createHash("sha256").update(graphToken).digest("base64url");
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.groups;

    const groups: string[] = [];
    let url: string | undefined = MEMBER_OF;
    while (url) {
      let response: Response;
      try {
        response = await fetchFn(url, {
          headers: { Authorization: `Bearer ${graphToken}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new UpstreamError("upstream", "Graph memberOf request failed", {
          stage: "memberOf",
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
      if (!response.ok) {
        throw new UpstreamError("upstream", `Graph memberOf failed: ${response.status}`, {
          stage: "memberOf",
          status: response.status,
        });
      }
      let page: MemberOfPage;
      try {
        page = (await response.json()) as MemberOfPage;
      } catch (error) {
        throw new UpstreamError("upstream", "Graph memberOf returned invalid JSON", {
          stage: "memberOf",
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
      for (const entry of page.value ?? []) if (entry.id) groups.push(entry.id);
      url = page["@odata.nextLink"];
    }

    cache.set(key, { groups, expiresAt: now() + ttlMs });
    return groups;
  };
}
