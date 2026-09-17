import { createHash, randomUUID } from "node:crypto";
import type { TokenCredential } from "@azure/identity";
import { CryptographyClient } from "@azure/keyvault-keys";

/** Signs a SHA-256 digest with RSASSA-PKCS1-v1_5 without exposing the private key. */
export interface Signer {
  signRs256(digest: Uint8Array): Promise<Uint8Array>;
}

export interface ClientAssertionOptions {
  tenantId: string;
  clientId: string;
  /** SHA-1 thumbprint (hex) of the certificate registered on the app. */
  certificateThumbprintSha1Hex: string;
  signer: Signer;
  now?: () => number;
  newJti?: () => string;
}

const base64Url = (value: Uint8Array | string) => Buffer.from(value).toString("base64url");

/** RFC 7523 client assertion accepted by the Microsoft identity platform (5-minute lifetime). */
export async function createClientAssertion(options: ClientAssertionOptions): Promise<string> {
  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    x5t: base64Url(Buffer.from(options.certificateThumbprintSha1Hex, "hex")),
  };
  const payload = {
    aud: `https://login.microsoftonline.com/${options.tenantId}/oauth2/v2.0/token`,
    iss: options.clientId,
    sub: options.clientId,
    jti: (options.newJti ?? randomUUID)(),
    nbf: nowSeconds,
    iat: nowSeconds,
    exp: nowSeconds + 300,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const digest = createHash("sha256").update(signingInput).digest();
  const signature = await options.signer.signRs256(digest);
  return `${signingInput}.${base64Url(signature)}`;
}

/** Signer backed by a Key Vault key; the caller needs "Key Vault Crypto User" on that key. */
export function keyVaultSigner(keyId: string, credential: TokenCredential): Signer {
  const client = new CryptographyClient(keyId, credential);
  return {
    signRs256: async (digest) => (await client.sign("RS256", digest)).result,
  };
}
