import { beforeAll, describe, expect, it } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { createTokenValidator, type TokenValidator } from "./token-validator.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const AUDIENCE = "33333333-3333-3333-3333-333333333333";
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

type Key = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let signingKey: Key;
let foreignKey: Key;
let keys: JWTVerifyGetKey;
let validate: TokenValidator;

const baseClaims: JWTPayload = {
  tid: TENANT,
  oid: "user-object-id",
  name: "Test User A",
  scp: "user_impersonation",
};

async function sign(
  claims: JWTPayload = baseClaims,
  options: { key?: Key; issuer?: string; audience?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(options.key ?? signingKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
  validate = createTokenValidator({
    tenantId: TENANT,
    audience: AUDIENCE,
    requiredScope: "user_impersonation",
    keys,
  });
});

describe("createTokenValidator", () => {
  it("accepts a valid token and returns the user", async () => {
    const result = await validate(`Bearer ${await sign()}`);
    expect(result).toEqual({ ok: true, user: { objectId: "user-object-id", name: "Test User A" } });
  });

  it("falls back to preferred_username when name is absent", async () => {
    const { name: _name, ...claims } = baseClaims;
    const result = await validate(
      `Bearer ${await sign({ ...claims, preferred_username: "a@contoso.com" })}`,
    );
    expect(result).toEqual({
      ok: true,
      user: { objectId: "user-object-id", name: "a@contoso.com" },
    });
  });

  it.each([undefined, "", "Basic abc", "Bearer"])("rejects missing token (%s)", async (header) => {
    expect(await validate(header)).toEqual({ ok: false, reason: "missing-token" });
  });

  it("rejects an expired token", async () => {
    const token = await sign(baseClaims, { expiresIn: "-10m" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token signed by an unknown key", async () => {
    const token = await sign(baseClaims, { key: foreignKey });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token for another audience", async () => {
    const token = await sign(baseClaims, { audience: "https://graph.microsoft.com" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token from another tenant", async () => {
    const token = await sign(
      { ...baseClaims, tid: OTHER_TENANT },
      { issuer: `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0` },
    );
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "wrong-tenant" });
  });

  it("rejects a token whose issuer does not match the tenant", async () => {
    const token = await sign(baseClaims, { issuer: "https://sts.windows.net/whatever/" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token without the required scope", async () => {
    const token = await sign({ ...baseClaims, scp: "User.Read" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "missing-scope" });
  });

  it("rejects a token without oid", async () => {
    const { oid: _oid, ...claims } = baseClaims;
    expect(await validate(`Bearer ${await sign(claims)}`)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });
});
