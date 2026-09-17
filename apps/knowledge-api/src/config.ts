export interface ApiConfig {
  tenantId: string;
  apiClientId: string;
  searchSiteUrls: string[];
  keyVaultKeyId: string;
  oboCertThumbprint: string;
  openAiEndpoint: string;
  openAiDeployment: string;
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

  return {
    tenantId: required(env, "TENANT_ID"),
    apiClientId: required(env, "API_CLIENT_ID"),
    searchSiteUrls,
    keyVaultKeyId: required(env, "KEY_VAULT_KEY_ID"),
    oboCertThumbprint: required(env, "OBO_CERT_THUMBPRINT"),
    openAiEndpoint: required(env, "AZURE_OPENAI_ENDPOINT"),
    openAiDeployment: required(env, "AZURE_OPENAI_DEPLOYMENT"),
  };
}
