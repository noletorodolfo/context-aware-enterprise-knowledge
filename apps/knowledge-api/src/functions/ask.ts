import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { MockLlmProvider } from "@kb/llm-providers";
import { createTokenValidator, entraJwks } from "../auth/token-validator.js";
import { handleAsk, type AskLogger } from "../ask/handle-ask.js";
import { loadConfig } from "../config.js";

const config = loadConfig(process.env);
const validateToken = createTokenValidator({
  tenantId: config.tenantId,
  audience: config.apiClientId,
  requiredScope: "user_impersonation",
  keys: entraJwks(config.tenantId),
});
const provider = new MockLlmProvider();

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
      },
      {
        validateToken,
        provider,
        logger: contextLogger(context),
        newCorrelationId: randomUUID,
        now: Date.now,
      },
    );
    return { status: response.status, headers: response.headers, jsonBody: response.jsonBody };
  },
});
