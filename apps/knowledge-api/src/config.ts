import { RETRIEVERS, type RetrieverName } from "./ask/selection.js";

export interface ApiConfig {
  tenantId: string;
  apiClientId: string;
  searchSiteUrls: string[];
  keyVaultKeyId: string;
  oboCertThumbprint: string;
  openAiEndpoint: string;
  openAiDeployment: string;
  openAiEmbeddingDeployment: string;
  searchEndpoint: string;
  searchIndexName: string;
  /** Retriever used for callers without the Evaluator role. */
  searchBackend: RetrieverName;
}

function optional(env: Record<string, string | undefined>, name: string, fallback: string): string {
  return env[name]?.trim() || fallback;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required setting: ${name}`);
  return value;
}

/** Reads app settings. The API has no secrets: only identifiers and URLs. */
export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  const searchSiteUrls = required(env, "SEARCH_SITE_URLS")
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => url !== "");
  if (searchSiteUrls.length === 0) throw new Error("Missing required setting: SEARCH_SITE_URLS");

  const backend = optional(env, "SEARCH_BACKEND", "graph");
  if (!RETRIEVERS.includes(backend as RetrieverName)) {
    throw new Error(`SEARCH_BACKEND must be one of: ${RETRIEVERS.join(", ")}`);
  }
  const searchBackend = backend as RetrieverName;

  return {
    tenantId: required(env, "TENANT_ID"),
    apiClientId: required(env, "API_CLIENT_ID"),
    searchSiteUrls,
    keyVaultKeyId: required(env, "KEY_VAULT_KEY_ID"),
    oboCertThumbprint: required(env, "OBO_CERT_THUMBPRINT"),
    openAiEndpoint: required(env, "AZURE_OPENAI_ENDPOINT"),
    openAiDeployment: required(env, "AZURE_OPENAI_DEPLOYMENT"),
    openAiEmbeddingDeployment: optional(env, "AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "embedding"),
    searchEndpoint: optional(env, "SEARCH_ENDPOINT", ""),
    searchIndexName: optional(env, "SEARCH_INDEX_NAME", "kb-chunks-dev"),
    searchBackend,
  };
}
