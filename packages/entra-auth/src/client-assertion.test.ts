import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClientAssertion, type Signer } from "./client-assertion.js";

const decode = (segment: string) => JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

describe("createClientAssertion", () => {
  it("builds an RS256 JWT for the tenant token endpoint and signs its SHA-256 digest via the signer", async () => {
    const digests: Uint8Array[] = [];
    const signer: Signer = {
      signRs256: (digest) => {
        digests.push(digest);
        return Promise.resolve(new Uint8Array([1, 2, 3, 4]));
      },
    };

    const jwt = await createClientAssertion({
      tenantId: "tenant-1",
      clientId: "client-1",
      certificateThumbprintSha1Hex: "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678",
      signer,
      now: () => 1_700_000_000_000,
      newJti: () => "jti-1",
    });

    const [header, payload, signature] = jwt.split(".");
    expect(decode(header ?? "")).toEqual({
      alg: "RS256",
      typ: "JWT",
      x5t: Buffer.from("A1B2C3D4E5F60718293A4B5C6D7E8F9012345678", "hex").toString("base64url"),
    });
    expect(decode(payload ?? "")).toEqual({
      aud: "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token",
      iss: "client-1",
      sub: "client-1",
      jti: "jti-1",
      nbf: 1_700_000_000,
      iat: 1_700_000_000,
      exp: 1_700_000_300,
    });
    expect(signature).toBe(Buffer.from([1, 2, 3, 4]).toString("base64url"));
    expect(Buffer.from(digests[0] ?? [])).toEqual(
      createHash("sha256").update(`${header}.${payload}`).digest(),
    );
  });
});
