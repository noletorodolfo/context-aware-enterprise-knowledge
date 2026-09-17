import { describe, expect, it } from "vitest";
import { UpstreamError } from "@kb/core";
import { GRAPH_DELEGATED_SCOPES, createOboExchanger } from "./obo.js";

type Call = { url: string; body: URLSearchParams };

function fakeFetch(responses: { status: number; json: unknown }[] | Error) {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    if (responses instanceof Error) return Promise.reject(responses);
    const next = responses.shift() ?? { status: 500, json: {} };
    return Promise.resolve(
      new Response(JSON.stringify(next.json), {
        status: next.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

function exchanger(fetchFn: typeof fetch, clock = { now: 1_000_000 }) {
  return createOboExchanger({
    tenantId: "tenant-1",
    clientId: "client-1",
    scopes: GRAPH_DELEGATED_SCOPES,
    createAssertion: () => Promise.resolve("signed-assertion"),
    fetchFn,
    now: () => clock.now,
  });
}

describe("createOboExchanger", () => {
  it("posts the OBO grant with the client assertion and returns the Graph token", async () => {
    const { calls, fetchFn } = fakeFetch([
      { status: 200, json: { access_token: "graph-token", expires_in: 3600 } },
    ]);
    await expect(exchanger(fetchFn)("user-token", "oid-a")).resolves.toBe("graph-token");

    expect(calls[0]?.url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    const body = calls[0]?.body;
    expect(body?.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body?.get("client_id")).toBe("client-1");
    expect(body?.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    expect(body?.get("client_assertion")).toBe("signed-assertion");
    expect(body?.get("assertion")).toBe("user-token");
    expect(body?.get("requested_token_use")).toBe("on_behalf_of");
    expect(body?.get("scope")).toBe(
      "https://graph.microsoft.com/Sites.Read.All https://graph.microsoft.com/Files.Read.All",
    );
  });

  it("caches per user until one minute before expiry", async () => {
    const clock = { now: 1_000_000 };
    const { calls, fetchFn } = fakeFetch([
      { status: 200, json: { access_token: "token-a1", expires_in: 3600 } },
      { status: 200, json: { access_token: "token-b", expires_in: 3600 } },
      { status: 200, json: { access_token: "token-a2", expires_in: 3600 } },
    ]);
    const exchange = exchanger(fetchFn, clock);

    expect(await exchange("user-token-a", "oid-a")).toBe("token-a1");
    expect(await exchange("user-token-a", "oid-a")).toBe("token-a1");
    expect(await exchange("user-token-b", "oid-b")).toBe("token-b");
    clock.now += 3_600_000 - 59_000;
    expect(await exchange("user-token-a", "oid-a")).toBe("token-a2");
    expect(calls).toHaveLength(3);
  });

  it.each([
    [{ error: "invalid_grant", error_description: "AADSTS65001: consent", error_codes: [65001] }],
    [{ error: "interaction_required", error_description: "AADSTS50076: MFA" }],
  ])("maps consent/interaction failures to consent-required", async (json) => {
    const { fetchFn } = fakeFetch([{ status: 400, json }]);
    await expect(exchanger(fetchFn)("t", "oid")).rejects.toMatchObject({
      name: "UpstreamError",
      kind: "consent-required",
    });
  });

  it("maps other token endpoint failures to upstream", async () => {
    const { fetchFn } = fakeFetch([
      { status: 401, json: { error: "invalid_client", error_description: "AADSTS700027" } },
    ]);
    await expect(exchanger(fetchFn)("t", "oid")).rejects.toMatchObject({ kind: "upstream" });
  });

  it("maps network failures and assertion failures to upstream", async () => {
    const { fetchFn } = fakeFetch(new TypeError("fetch failed"));
    await expect(exchanger(fetchFn)("t", "oid")).rejects.toBeInstanceOf(UpstreamError);

    const failingAssertion = createOboExchanger({
      tenantId: "tenant-1",
      clientId: "client-1",
      scopes: GRAPH_DELEGATED_SCOPES,
      createAssertion: () => Promise.reject(new Error("Key Vault 403")),
      fetchFn: fakeFetch([]).fetchFn,
    });
    await expect(failingAssertion("t", "oid")).rejects.toMatchObject({ kind: "upstream" });
  });
});
