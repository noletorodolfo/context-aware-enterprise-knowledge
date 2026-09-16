export interface ApiConfig {
  tenantId: string;
  apiClientId: string;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required setting: ${name}`);
  return value;
}

/** Reads app settings. The API has no secrets: only public identifiers. */
export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  return {
    tenantId: required(env, "TENANT_ID"),
    apiClientId: required(env, "API_CLIENT_ID"),
  };
}
