/** Entra group object ids allowed to read each SharePoint library, by library name. */
export type LibraryAcl = Record<string, string[]>;

export interface IndexerConfig {
  tenantId: string;
  /** App registration used app-only, with `Sites.Selected` granted on the demo site alone. */
  ingestionClientId: string;
  keyVaultKeyId: string;
  certThumbprint: string;
  siteUrl: string;
  libraryAcl: LibraryAcl;
  searchEndpoint: string;
  searchIndexName: string;
  openAiEndpoint: string;
  openAiEmbeddingDeployment: string;
  storageAccountUrl: string;
  queueName: string;
  notificationUrl: string;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required setting: ${name}`);
  return value;
}

/**
 * Reads app settings. The only secret the ingestion service holds is the webhook `clientState`,
 * which is read from Key Vault through a reference, never from this file.
 */
export function loadConfig(env: Record<string, string | undefined>): IndexerConfig {
  const libraryAcl = parseLibraryAcl(required(env, "INGESTION_LIBRARY_ACL"));
  return {
    tenantId: required(env, "TENANT_ID"),
    ingestionClientId: required(env, "INGESTION_CLIENT_ID"),
    keyVaultKeyId: required(env, "KEY_VAULT_KEY_ID"),
    certThumbprint: required(env, "INGESTION_CERT_THUMBPRINT"),
    siteUrl: required(env, "INGESTION_SITE_URL").replace(/\/+$/, ""),
    libraryAcl,
    searchEndpoint: required(env, "SEARCH_ENDPOINT"),
    searchIndexName: required(env, "SEARCH_INDEX_NAME"),
    openAiEndpoint: required(env, "AZURE_OPENAI_ENDPOINT"),
    openAiEmbeddingDeployment: required(env, "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"),
    storageAccountUrl: required(env, "INGESTION_STATE_ACCOUNT_URL"),
    queueName: required(env, "INGESTION_QUEUE_NAME"),
    notificationUrl: required(env, "INGESTION_NOTIFICATION_URL"),
  };
}

/**
 * Fails closed: a library without groups would be indexed as readable by nobody or, worse, by
 * everyone. The same rule the operator CLI applies, enforced before any message is consumed.
 */
export function parseLibraryAcl(raw: string): LibraryAcl {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("INGESTION_LIBRARY_ACL is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INGESTION_LIBRARY_ACL must be an object of library to group ids");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error("INGESTION_LIBRARY_ACL configures no library");
  for (const [library, groups] of entries) {
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new Error(`INGESTION_LIBRARY_ACL: library "${library}" has no groups`);
    }
    if (groups.some((group) => typeof group !== "string" || group.trim() === "")) {
      throw new Error(`INGESTION_LIBRARY_ACL: library "${library}" has an empty group id`);
    }
  }
  return Object.fromEntries(entries) as LibraryAcl;
}
