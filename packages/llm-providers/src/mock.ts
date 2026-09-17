import type { GenerateInput, GenerateResult, LlmProvider } from "./provider.js";

export const MOCK_PROMPT_VERSION = "mock";

/**
 * Deterministic provider for tests and local runs. The answer text is pt-BR because it is
 * shown to end users. When chunks exist it cites the beginning of the first one verbatim.
 */
export class MockLlmProvider implements LlmProvider {
  public readonly promptVersion = MOCK_PROMPT_VERSION;

  public generate({ question, user, chunks }: GenerateInput): Promise<GenerateResult> {
    const first = chunks[0];
    return Promise.resolve({
      draft: {
        text:
          `Olá, ${user.name}! Esta é uma resposta de teste. ` +
          `Você perguntou "${question.text}" na página "${question.page.title}".`,
        citations: first ? [{ chunkId: first.id, quote: first.text.slice(0, 80) }] : [],
        refused: false,
        promptVersion: MOCK_PROMPT_VERSION,
      },
    });
  }
}
