import { describe, expect, it } from "vitest";
import { aclGroupsFor, validateIndexerConfig } from "./acl.js";

const config = {
  siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  searchEndpoint: "https://srch.search.windows.net",
  indexName: "kb-chunks-dev",
  openAiEndpoint: "https://oai.openai.azure.com/",
  embeddingDeployment: "embedding",
  libraries: {
    Politicas: ["group-colaboradores"],
    TI: ["group-colaboradores"],
    "RH-Restrito": ["group-rh"],
  },
};

describe("aclGroupsFor", () => {
  it("returns the groups configured for the library", () => {
    expect(aclGroupsFor("RH-Restrito", config)).toEqual(["group-rh"]);
  });

  it("fails closed for an unmapped library instead of indexing it for everyone", () => {
    expect(() => aclGroupsFor("Financeiro", config)).toThrow(/Financeiro/);
  });
});

describe("validateIndexerConfig", () => {
  it("accepts a complete configuration", () => {
    expect(validateIndexerConfig(config)).toEqual(config);
  });

  it.each(["siteUrl", "searchEndpoint", "indexName", "openAiEndpoint", "embeddingDeployment"])(
    "requires %s",
    (field) => {
      const incomplete = { ...config, [field]: "" };
      expect(() => validateIndexerConfig(incomplete)).toThrow(new RegExp(field));
    },
  );

  it("requires at least one library with at least one group", () => {
    expect(() => validateIndexerConfig({ ...config, libraries: {} })).toThrow(/libraries/);
    expect(() => validateIndexerConfig({ ...config, libraries: { TI: [] } })).toThrow(/TI/);
  });
});
