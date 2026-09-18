import { readFileSync } from "node:fs";

export interface E2eConfig {
  tenantId: string;
  clientId: string;
  apiScope: string;
  apiBaseUrl: string;
  siteUrl: string;
  userA: string;
  userB: string;
}

/** Default location, shared by the end-to-end test and the evaluation runner. */
export const E2E_DIR = new URL("../../apps/knowledge-api/e2e/", import.meta.url);

/** Token cache file of a test user, next to the end-to-end configuration. */
export const tokenCacheFile = (user: "a" | "b"): URL =>
  new URL(`.token-cache-${user}.json`, E2E_DIR);

export function loadE2eConfig(path: URL = new URL("e2e.config.json", E2E_DIR)): E2eConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      "Missing apps/knowledge-api/e2e/e2e.config.json. Copy e2e.config.example.json and fill in real values.",
    );
  }
  const config = JSON.parse(raw) as Partial<E2eConfig>;
  for (const key of [
    "tenantId",
    "clientId",
    "apiScope",
    "apiBaseUrl",
    "siteUrl",
    "userA",
    "userB",
  ] as const) {
    if (!config[key]) throw new Error(`e2e.config.json: "${key}" is required.`);
  }
  return config as E2eConfig;
}
