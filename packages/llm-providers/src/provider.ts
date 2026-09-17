import type { Chunk, DraftAnswer, Question } from "@kb/core";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateInput {
  question: Question;
  /** Authenticated caller, taken from the validated access token. */
  user: { name: string };
  /** Sections retrieved with the caller's own permissions; the only allowed sources. */
  chunks: Chunk[];
}

export interface GenerateResult {
  draft: DraftAnswer;
  usage?: TokenUsage;
}

export interface LlmProvider {
  readonly promptVersion: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
}
