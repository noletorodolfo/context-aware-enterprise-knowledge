import type { Answer, Question } from "@kb/core";

export interface GenerateInput {
  question: Question;
  /** Authenticated caller, taken from the validated access token. */
  user: { name: string };
}

export interface LlmProvider {
  generate(input: GenerateInput): Promise<Answer>;
}
