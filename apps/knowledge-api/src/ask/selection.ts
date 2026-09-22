export const RETRIEVERS = ["graph", "aisearch"] as const;
export const PROMPTS = ["v1", "v2"] as const;

export type RetrieverName = (typeof RETRIEVERS)[number];
export type PromptVersion = (typeof PROMPTS)[number];

export interface SelectionDefaults {
  retriever: RetrieverName;
  prompt: PromptVersion;
}

export type Selection =
  ({ ok: true } & SelectionDefaults) | { ok: false; field: "x-kb-retriever" | "x-kb-prompt" };

const header = (headers: Record<string, string | undefined>, name: string): string | undefined => {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1]?.trim().toLowerCase();
};

/**
 * Evaluation runs compare retrievers and prompts on the deployed environment, so holders of the
 * `Evaluator` app role may override both per request. For everyone else the headers do not exist:
 * they are ignored rather than rejected, so a stray header never breaks a real user's question.
 */
export function selectVariant(
  headers: Record<string, string | undefined>,
  isEvaluator: boolean,
  defaults: SelectionDefaults,
): Selection {
  if (!isEvaluator) return { ok: true, ...defaults };

  const requestedRetriever = header(headers, "x-kb-retriever");
  if (
    requestedRetriever !== undefined &&
    !RETRIEVERS.includes(requestedRetriever as RetrieverName)
  ) {
    return { ok: false, field: "x-kb-retriever" };
  }
  const requestedPrompt = header(headers, "x-kb-prompt");
  if (requestedPrompt !== undefined && !PROMPTS.includes(requestedPrompt as PromptVersion)) {
    return { ok: false, field: "x-kb-prompt" };
  }

  return {
    ok: true,
    retriever: (requestedRetriever as RetrieverName | undefined) ?? defaults.retriever,
    prompt: (requestedPrompt as PromptVersion | undefined) ?? defaults.prompt,
  };
}
