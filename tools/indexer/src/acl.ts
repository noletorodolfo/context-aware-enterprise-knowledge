export interface IndexerConfig {
  siteUrl: string;
  searchEndpoint: string;
  indexName: string;
  openAiEndpoint: string;
  embeddingDeployment: string;
  /** SharePoint library name to the Entra group object ids allowed to read it. */
  libraries: Record<string, string[]>;
}

const REQUIRED = [
  "siteUrl",
  "searchEndpoint",
  "indexName",
  "openAiEndpoint",
  "embeddingDeployment",
] as const;

/** Fails closed: a library without groups would otherwise be indexed as readable by nobody or everyone. */
export function aclGroupsFor(library: string, config: IndexerConfig): string[] {
  const groups = config.libraries[library];
  if (!groups || groups.length === 0) {
    throw new Error(`indexer.config.json: library "${library}" has no aclGroups configured`);
  }
  return groups;
}

export function validateIndexerConfig(raw: unknown): IndexerConfig {
  const config = (raw ?? {}) as Partial<IndexerConfig>;
  for (const field of REQUIRED) {
    if (typeof config[field] !== "string" || config[field] === "") {
      throw new Error(`indexer.config.json: "${field}" is required`);
    }
  }
  const libraries = config.libraries;
  if (!libraries || Object.keys(libraries).length === 0) {
    throw new Error('indexer.config.json: "libraries" must map every library to its Entra groups');
  }
  for (const [library, groups] of Object.entries(libraries)) {
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new Error(`indexer.config.json: library "${library}" has no aclGroups configured`);
    }
  }
  return config as IndexerConfig;
}
