import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export type TokenRejectionReason =
  "missing-token" | "invalid-token" | "wrong-tenant" | "missing-scope";

export interface AuthenticatedUser {
  objectId: string;
  name: string;
}

export type TokenValidationResult =
  { ok: true; user: AuthenticatedUser } | { ok: false; reason: TokenRejectionReason };

export type TokenValidator = (
  authorizationHeader: string | undefined,
) => Promise<TokenValidationResult>;

export interface TokenValidatorOptions {
  tenantId: string;
  /** Application (client) ID of the Knowledge API; v2 access tokens use it as `aud`. */
  audience: string;
  requiredScope: string;
  keys: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
}

/** Signing keys of the tenant's Entra ID v2 endpoint (cached and rotated by jose). */
export function entraJwks(tenantId: string): JWTVerifyGetKey {
  return createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
  );
}

const reject = (reason: TokenRejectionReason): TokenValidationResult => ({ ok: false, reason });

export function createTokenValidator(options: TokenValidatorOptions): TokenValidator {
  const expectedIssuer = `https://login.microsoftonline.com/${options.tenantId}/v2.0`;

  return async (authorizationHeader) => {
    const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader ?? "");
    const token = match?.[1];
    if (!token) return reject("missing-token");

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, options.keys, {
        audience: options.audience,
        algorithms: ["RS256"],
        clockTolerance: options.clockToleranceSeconds ?? 60,
      }));
    } catch {
      return reject("invalid-token");
    }

    // Tenant is checked before issuer so a foreign-tenant token gets a precise reason in the logs.
    if (payload["tid"] !== options.tenantId) return reject("wrong-tenant");
    if (payload.iss !== expectedIssuer) return reject("invalid-token");

    const scopes = typeof payload["scp"] === "string" ? payload["scp"].split(" ") : [];
    if (!scopes.includes(options.requiredScope)) return reject("missing-scope");

    const objectId = payload["oid"];
    if (typeof objectId !== "string" || objectId === "") return reject("invalid-token");

    const name = [payload["name"], payload["preferred_username"]].find(
      (value): value is string => typeof value === "string" && value !== "",
    );

    // "usuário" (not "unknown user"): this fallback can surface verbatim in the pt-BR mock
    // answer greeting, so it must already be in Portuguese.
    return { ok: true, user: { objectId, name: name ?? "usuário" } };
  };
}
