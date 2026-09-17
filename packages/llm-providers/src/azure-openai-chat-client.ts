import { getBearerTokenProvider, type TokenCredential } from "@azure/identity";
import { UpstreamError } from "@kb/core";
import { AzureOpenAI } from "openai";
import type { ChatClient } from "./azure-openai.js";

export interface AzureOpenAiChatClientOptions {
  endpoint: string;
  deployment: string;
  credential: TokenCredential;
  timeoutMs?: number;
  apiVersion?: string;
}

/** ChatClient over the Azure OpenAI SDK, authenticated with Entra ID (no API key). */
export function createAzureOpenAiChatClient(options: AzureOpenAiChatClientOptions): ChatClient {
  const client = new AzureOpenAI({
    endpoint: options.endpoint,
    deployment: options.deployment,
    apiVersion: options.apiVersion ?? "2024-10-21",
    azureADTokenProvider: getBearerTokenProvider(
      options.credential,
      "https://cognitiveservices.azure.com/.default",
    ),
    timeout: options.timeoutMs ?? 20_000,
    maxRetries: 0,
  });

  return {
    complete: async (request) => {
      try {
        const completion = await client.chat.completions.create({
          model: options.deployment,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          max_completion_tokens: request.maxOutputTokens,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.jsonSchema.name,
              strict: request.jsonSchema.strict,
              schema: request.jsonSchema.schema,
            },
          },
        });
        return {
          content: completion.choices[0]?.message.content ?? "",
          ...(completion.usage
            ? {
                usage: {
                  inputTokens: completion.usage.prompt_tokens,
                  outputTokens: completion.usage.completion_tokens,
                },
              }
            : {}),
        };
      } catch {
        throw new UpstreamError("llm-unavailable", "Azure OpenAI request failed");
      }
    },
  };
}
