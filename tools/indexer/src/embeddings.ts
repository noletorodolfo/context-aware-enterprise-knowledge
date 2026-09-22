import type { TokenCredential } from "@azure/identity";

const API_VERSION = "2024-10-21";
const OPENAI_SCOPE = "https://cognitiveservices.azure.com/.default";

export interface EmbedderOptions {
  endpoint: string;
  deployment: string;
  credential: TokenCredential;
  fetchFn?: typeof fetch;
}

export type Embedder = (inputs: string[]) => Promise<number[][]>;

/** Azure OpenAI embeddings over REST, authenticated with Entra ID (no API key). */
export function createEmbedder(options: EmbedderOptions): Embedder {
  const fetchFn = options.fetchFn ?? fetch;
  const base = options.endpoint.replace(/\/+$/, "");

  return async (inputs) => {
    if (inputs.length === 0) return [];
    const token = await options.credential.getToken(OPENAI_SCOPE);
    if (!token) throw new Error("Could not acquire a token for Azure OpenAI");

    const response = await fetchFn(
      `${base}/openai/deployments/${options.deployment}/embeddings?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: inputs }),
      },
    );
    if (!response.ok) throw new Error(`Azure OpenAI embeddings failed: ${response.status}`);

    const json = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
    const data = json.data ?? [];
    if (data.length !== inputs.length) {
      throw new Error(
        `Azure OpenAI returned ${data.length} embeddings for ${inputs.length} inputs`,
      );
    }
    return [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  };
}
