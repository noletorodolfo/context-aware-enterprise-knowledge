import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const env = {
  TENANT_ID: "tenant-1",
  API_CLIENT_ID: "client-1",
  SEARCH_SITE_URLS:
    " https://contoso.sharepoint.com/sites/kb-demo/ ,https://contoso.sharepoint.com/sites/x ",
  KEY_VAULT_KEY_ID: "https://kv.vault.azure.net/keys/obo-dev",
  OBO_CERT_THUMBPRINT: "ABCDEF",
  AZURE_OPENAI_ENDPOINT: "https://oai.openai.azure.com/",
  AZURE_OPENAI_DEPLOYMENT: "chat",
};

describe("loadConfig", () => {
  it("reads all settings and normalizes the site list", () => {
    expect(loadConfig(env)).toEqual({
      tenantId: "tenant-1",
      apiClientId: "client-1",
      searchSiteUrls: [
        "https://contoso.sharepoint.com/sites/kb-demo",
        "https://contoso.sharepoint.com/sites/x",
      ],
      keyVaultKeyId: "https://kv.vault.azure.net/keys/obo-dev",
      oboCertThumbprint: "ABCDEF",
      openAiEndpoint: "https://oai.openai.azure.com/",
      openAiDeployment: "chat",
    });
  });

  it.each(Object.keys(env))("throws when %s is missing or blank", (name) => {
    const partial: Record<string, string | undefined> = { ...env, [name]: " " };
    expect(() => loadConfig(partial)).toThrow(`Missing required setting: ${name}`);
  });
});
