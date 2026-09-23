// One place where the app's real Azure dependencies are built, so each function module stays thin
// and every collaborator can be replaced in tests.
import { DefaultAzureCredential } from "@azure/identity";
import { QueueClient } from "@azure/storage-queue";
import { createAppTokenProvider, createClientAssertion, keyVaultSigner } from "@kb/entra-auth";
import { aclGroupsFor, createSearchIndexClient } from "@kb/ingestion";
import { createEmbedder } from "@kb/llm-providers";
import { loadConfig } from "./config.js";
import { createIngestionState } from "./state.js";
import { createSubscriptionClient } from "./subscriptions.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
/** Short enough that every Graph resource type accepts it; the timer renews well before it lapses. */
export const SUBSCRIPTION_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;
export const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;

export const config = loadConfig(process.env);
const credential = new DefaultAzureCredential();

export const graphToken = createAppTokenProvider({
  tenantId: config.tenantId,
  clientId: config.ingestionClientId,
  scope: GRAPH_SCOPE,
  createAssertion: () =>
    createClientAssertion({
      tenantId: config.tenantId,
      clientId: config.ingestionClientId,
      certificateThumbprintSha1Hex: config.certThumbprint,
      signer: keyVaultSigner(config.keyVaultKeyId, credential),
    }),
});

export const state = createIngestionState(config.storageAccountUrl, credential);

export const search = createSearchIndexClient({
  endpoint: config.searchEndpoint,
  indexName: config.searchIndexName,
  credential,
});

export const embed = createEmbedder({
  endpoint: config.openAiEndpoint,
  deployment: config.openAiEmbeddingDeployment,
  credential,
});

export const subscriptions = createSubscriptionClient({
  siteUrl: config.siteUrl,
  notificationUrl: config.notificationUrl,
  clientState: clientState(),
  lifetimeMs: SUBSCRIPTION_LIFETIME_MS,
  token: graphToken,
});

export const queue = new QueueClient(
  `${config.storageAccountUrl.replace(/\/+$/, "").replace(".blob.", ".queue.")}/${config.queueName}`,
  credential,
);

/** The shared secret Graph echoes in every notification, delivered as a Key Vault reference. */
export function clientState(): string {
  const value = process.env.INGESTION_CLIENT_STATE?.trim();
  if (!value) throw new Error("Missing required setting: INGESTION_CLIENT_STATE");
  return value;
}

export const libraryGroups = (library: string): string[] =>
  aclGroupsFor(library, {
    siteUrl: config.siteUrl,
    searchEndpoint: config.searchEndpoint,
    indexName: config.searchIndexName,
    openAiEndpoint: config.openAiEndpoint,
    embeddingDeployment: config.openAiEmbeddingDeployment,
    libraries: config.libraryAcl,
  });
