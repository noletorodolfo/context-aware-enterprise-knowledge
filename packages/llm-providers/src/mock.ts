import type { Answer } from "@kb/core";
import type { GenerateInput, LlmProvider } from "./provider.js";

export const MOCK_PROMPT_VERSION = "mock";

/**
 * Deterministic provider used while the end-to-end plumbing is built.
 * The answer text is pt-BR because it is shown to end users.
 */
export class MockLlmProvider implements LlmProvider {
  generate({ question, user }: GenerateInput): Promise<Answer> {
    return Promise.resolve({
      text:
        `Olá, ${user.name}! Esta é uma resposta de teste. ` +
        `Você perguntou "${question.text}" na página "${question.page.title}".`,
      citations: [],
      refused: false,
      promptVersion: MOCK_PROMPT_VERSION,
    });
  }
}
