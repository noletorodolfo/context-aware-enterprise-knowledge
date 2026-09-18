import { beforeAll, describe, expect, it } from "vitest";
import { installTestTelemetry, type TestTelemetry } from "../../../test-support/otel.js";
import { AzureOpenAiProvider, type ChatClient } from "./azure-openai.js";

describe("AzureOpenAiProvider telemetry", () => {
  let telemetry: TestTelemetry;
  beforeAll(() => {
    telemetry = installTestTelemetry();
  });

  it("creates llm.generate with token counts and attempts, without prompt text", async () => {
    const answers = [
      "not json",
      JSON.stringify({
        answer: "R$ 150,00 por mês.",
        citations: [{ chunkId: "c1", quote: "R$ 150,00" }],
      }),
    ];
    const chat: ChatClient = {
      complete: () =>
        Promise.resolve({
          content: answers.shift() ?? "",
          usage: { inputTokens: 900, outputTokens: 60 },
        }),
    };
    const provider = new AzureOpenAiProvider({ chat, systemPrompt: "SYSTEM", promptVersion: "v1" });

    await provider.generate({
      question: {
        text: "Qual o valor do auxílio?",
        page: { url: "https://x/p", title: "Home", siteUrl: "https://x" },
      },
      user: { name: "A" },
      chunks: [
        { id: "c1", docId: "d1", title: "t", url: "https://x/d", text: "R$ 150,00", score: 1 },
      ],
    });

    const span = telemetry.span("llm.generate");
    expect(span.attributes).toEqual({
      "kb.prompt.version": "v1",
      "kb.chunks.count": 1,
      "kb.llm.attempts": 2,
      "gen_ai.usage.input_tokens": 900,
      "gen_ai.usage.output_tokens": 60,
    });
  });
});
