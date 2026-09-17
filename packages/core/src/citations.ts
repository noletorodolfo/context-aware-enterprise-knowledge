import type { Answer, Chunk, Citation, CitationDraft, DraftAnswer } from "./model.js";

/** Shown to end users (pt-BR) whenever the documents do not support an answer. */
export const REFUSAL_TEXT = "Não encontrei essa informação nos documentos disponíveis para você.";

export interface CitationCheck {
  valid: Citation[];
  rejected: { citation: CitationDraft; reason: "unknown-chunk" | "quote-not-found" }[];
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function refusal(promptVersion: string): Answer {
  return { text: REFUSAL_TEXT, citations: [], refused: true, promptVersion };
}

/**
 * Ensures each citation points to an excerpt that was actually retrieved and that the
 * quote exists literally in that excerpt. Valid citations gain the chunk's title and url.
 */
export function checkCitations(citations: CitationDraft[], retrieved: Chunk[]): CitationCheck {
  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const result: CitationCheck = { valid: [], rejected: [] };

  for (const citation of citations) {
    const chunk = byId.get(citation.chunkId);
    if (!chunk) {
      result.rejected.push({ citation, reason: "unknown-chunk" });
    } else if (!normalize(chunk.text).includes(normalize(citation.quote))) {
      result.rejected.push({ citation, reason: "quote-not-found" });
    } else {
      result.valid.push({ ...citation, title: chunk.title, url: chunk.url });
    }
  }
  return result;
}

/** Grounds a model draft: without at least one valid citation the answer becomes the refusal. */
export function enforceGrounding(draft: DraftAnswer, retrieved: Chunk[]): Answer {
  if (draft.refused) return refusal(draft.promptVersion);
  const { valid } = checkCitations(draft.citations, retrieved);
  if (valid.length === 0) return refusal(draft.promptVersion);
  return {
    text: draft.text,
    citations: valid,
    refused: false,
    promptVersion: draft.promptVersion,
  };
}
