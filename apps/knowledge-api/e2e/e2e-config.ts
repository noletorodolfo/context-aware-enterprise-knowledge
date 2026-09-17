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

export function loadE2eConfig(): E2eConfig {
  const path = new URL("./e2e.config.json", import.meta.url);
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
