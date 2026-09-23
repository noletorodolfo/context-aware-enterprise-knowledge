import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { maskPii } from "@kb/governance";
import {
  AzureOpenAiProvider,
  createAzureOpenAiChatClient,
  createEmbedder,
} from "@kb/llm-providers";
import { AiSearchRetriever, GraphSearchRetriever, createGroupMembership } from "@kb/retrievers";
import systemPromptV1 from "../../../../prompts/v1.md";
import systemPromptV2 from "../../../../prompts/v2.md";
import { createClientAssertion, keyVaultSigner } from "@kb/entra-auth";
import { GRAPH_DELEGATED_SCOPES, createOboExchanger } from "../auth/obo.js";
import { createTokenValidator, entraJwks } from "../auth/token-validator.js";
import { handleAsk, type AskLogger } from "../ask/handle-ask.js";
import { loadConfig } from "../config.js";

const config = loadConfig(process.env);
const credential = new DefaultAzureCredential();

const validateToken = createTokenValidator({
  tenantId: config.tenantId,
  audience: config.apiClientId,
  requiredScope: "user_impersonation",
  keys: entraJwks(config.tenantId),
});

const signer = keyVaultSigner(config.keyVaultKeyId, credential);
const exchangeToken = createOboExchanger({
  tenantId: config.tenantId,
  clientId: config.apiClientId,
  scopes: GRAPH_DELEGATED_SCOPES,
  createAssertion: () =>
    createClientAssertion({
      tenantId: config.tenantId,
      clientId: config.apiClientId,
      certificateThumbprintSha1Hex: config.oboCertThumbprint,
      signer,
    }),
});

const retrievers = {
  graph: new GraphSearchRetriever({ siteUrls: config.searchSiteUrls }),
  aisearch: new AiSearchRetriever({
    endpoint: config.searchEndpoint,
    indexName: config.searchIndexName,
    getToken: async () =>
      (await credential.getToken("https://search.azure.com/.default"))?.token ?? "",
    embed: createEmbedder({
      endpoint: config.openAiEndpoint,
      deployment: config.openAiEmbeddingDeployment,
      credential,
    }),
    groupsFor: createGroupMembership(),
  }),
};

const chat = createAzureOpenAiChatClient({
  endpoint: config.openAiEndpoint,
  deployment: config.openAiDeployment,
  credential,
});

const providers = {
  v1: new AzureOpenAiProvider({ chat, systemPrompt: systemPromptV1, promptVersion: "v1" }),
  v2: new AzureOpenAiProvider({ chat, systemPrompt: systemPromptV2, promptVersion: "v2" }),
};

function contextLogger(context: InvocationContext): AskLogger {
  const line = (event: string, data: Record<string, unknown>) => JSON.stringify({ event, ...data });
  return {
    info: (event, data) => context.log(line(event, data)),
    warn: (event, data) => context.warn(line(event, data)),
    error: (event, data) => context.error(line(event, data)),
  };
}

async function readJson(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

app.http("ask", {
  methods: ["POST"],
  authLevel: "anonymous", // the handler validates the Entra ID bearer token itself
  route: "ask",
  handler: async (request, context) => {
    const response = await handleAsk(
      {
        authorization: request.headers.get("authorization") ?? undefined,
        body: await readJson(request),
        headers: Object.fromEntries(request.headers.entries()),
      },
      {
        validateToken,
        exchangeToken,
        retrievers,
        providers,
        defaults: { retriever: config.searchBackend, prompt: "v1" },
        logger: contextLogger(context),
        maskPii,
        newCorrelationId: randomUUID,
        now: Date.now,
      },
    );
    return { status: response.status, headers: response.headers, jsonBody: response.jsonBody };
  },
});
