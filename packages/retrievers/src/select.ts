import type { Chunk } from "@kb/core";
import { normalizeText } from "./text.js";

export interface CandidateSection {
  docId: string;
  title: string;
  url: string;
  sectionIndex: number;
  heading: string;
  text: string;
}

export interface SelectionLimits {
  maxSections: number;
  maxChars: number;
}

export const DEFAULT_LIMITS: SelectionLimits = { maxSections: 8, maxChars: 12_000 };

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + needle.length)
  ) {
    count += 1;
  }
  return count;
}

/** Lexical relevance: keyword occurrences in heading + text; zero-score sections are dropped. */
export function selectChunks(
  keywords: string[],
  candidates: CandidateSection[],
  limits: SelectionLimits,
): Chunk[] {
  const scored = candidates
    .map((candidate, order) => {
      const text = candidate.heading ? `${candidate.heading}\n${candidate.text}` : candidate.text;
      const haystack = normalizeText(text);
      const score = keywords.reduce((sum, keyword) => sum + countOccurrences(haystack, keyword), 0);
      return { candidate, text, score, order };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const chunks: Chunk[] = [];
  let chars = 0;
  for (const { candidate, text, score } of scored) {
    if (chunks.length >= limits.maxSections) break;
    if (chars + text.length > limits.maxChars) continue;
    chars += text.length;
    chunks.push({
      id: `${candidate.docId}#${candidate.sectionIndex}`,
      docId: candidate.docId,
      title: candidate.title,
      url: candidate.url,
      text,
      score,
    });
  }
  return chunks;
}
