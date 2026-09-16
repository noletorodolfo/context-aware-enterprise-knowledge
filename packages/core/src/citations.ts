import type { Answer, Chunk, Citation } from "./model.js";

export interface CitationCheck {
  valid: Citation[];
  rejected: { citation: Citation; reason: "unknown-chunk" | "quote-not-found" }[];
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Garante que cada citação aponta para um trecho realmente recuperado e que a citação
 * existe literalmente nesse trecho. Citações inventadas pelo modelo são descartadas.
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

/** Aplica a checagem na resposta: se nenhuma citação sobreviver, a resposta vira recusa. */
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
