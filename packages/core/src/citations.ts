import type { Answer, Chunk, Citation } from "./model.js";

export interface CitationCheck {
  valid: Citation[];
  rejected: { citation: Citation; reason: "unknown-chunk" | "quote-not-found" }[];
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Ensures each citation points to an excerpt that was actually retrieved and that the
 * citation exists literally in that excerpt. Citations fabricated by the model are discarded.
 */
export function checkCitations(citations: Citation[], retrieved: Chunk[]): CitationCheck {
  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const result: CitationCheck = { valid: [], rejected: [] };

  for (const citation of citations) {
    const chunk = byId.get(citation.chunkId);
    if (!chunk) {
      result.rejected.push({ citation, reason: "unknown-chunk" });
    } else if (!normalize(chunk.text).includes(normalize(citation.quote))) {
      result.rejected.push({ citation, reason: "quote-not-found" });
    } else {
      result.valid.push(citation);
    }
  }
  return result;
}

/** Applies the check to the answer: if no citation survives, the answer becomes a refusal. */
export function enforceGrounding(answer: Answer, retrieved: Chunk[]): Answer {
  if (answer.refused) return answer;
  const { valid } = checkCitations(answer.citations, retrieved);
  if (valid.length > 0) return { ...answer, citations: valid };
  return {
    ...answer,
    text: "Não encontrei essa informação nos documentos disponíveis para você.",
    citations: [],
    refused: true,
  };
}
