import { isUpstreamError, UpstreamError, type Chunk } from "@kb/core";
import { z } from "zod";
import type { GenerateInput, GenerateResult, LlmProvider, TokenUsage } from "./provider.js";

export interface JsonSchemaFormat {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

export interface ChatCompletionRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  jsonSchema: JsonSchemaFormat;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: TokenUsage;
}

export interface ChatClient {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export const ANSWER_JSON_SCHEMA: JsonSchemaFormat = {
  name: "grounded_answer",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer", "citations"],
    properties: {
      answer: { type: "string" },
      citations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["chunkId", "quote"],
          properties: { chunkId: { type: "string" }, quote: { type: "string" } },
        },
      },
    },
  },
};

const answerSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(z.object({ chunkId: z.string(), quote: z.string() })),
});

const neutralize = (text: string) =>
  text
    .replace(/<(\/?)(documents?|question)>/gi, "‹$1$2›")
    .replace(/<(\/?)(documents?|question)\b/gi, "‹$1$2");

const attribute = (value: string) => value.replace(/"/g, "&quot;");

/** Question and retrieved sections, delimited so the prompt can declare the documents untrusted. */
export function buildUserMessage(question: string, chunks: Chunk[]): string {
  const documents = chunks
    .map(
      (chunk) =>
        `<document id="${attribute(chunk.id)}" title="${attribute(chunk.title)}">\n` +
        `${neutralize(chunk.text)}\n</document>\n`,
    )
    .join("");
  return `<question>\n${neutralize(question)}\n</question>\n<documents>\n${documents}</documents>`;
}

export interface AzureOpenAiProviderOptions {
  chat: ChatClient;
  systemPrompt: string;
  promptVersion: string;
  maxOutputTokens?: number;
}

export class AzureOpenAiProvider implements LlmProvider {
  public readonly promptVersion: string;
  private readonly options: AzureOpenAiProviderOptions;

  public constructor(options: AzureOpenAiProviderOptions) {
    this.options = options;
    this.promptVersion = options.promptVersion;
  }

  public async generate({ question, chunks }: GenerateInput): Promise<GenerateResult> {
    const request: ChatCompletionRequest = {
      system: this.options.systemPrompt,
      user: buildUserMessage(question.text, chunks),
      maxOutputTokens: this.options.maxOutputTokens ?? 600,
      jsonSchema: ANSWER_JSON_SCHEMA,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: ChatCompletionResponse;
      try {
        response = await this.options.chat.complete(request);
      } catch (error) {
        if (isUpstreamError(error)) throw error;
        throw new UpstreamError("llm-unavailable", "Azure OpenAI request failed");
      }

      let parsed: z.infer<typeof answerSchema> | undefined;
      try {
        const result = answerSchema.safeParse(JSON.parse(response.content));
        parsed = result.success ? result.data : undefined;
      } catch {
        parsed = undefined;
      }
      if (!parsed) continue;

      return {
        draft: {
          text: parsed.answer,
          citations: parsed.citations,
          refused: false,
          promptVersion: this.promptVersion,
        },
        ...(response.usage ? { usage: response.usage } : {}),
      };
    }
    throw new UpstreamError("llm-invalid-output", "Model output did not match the answer schema");
  }
}
