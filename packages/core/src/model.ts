/** Context of the SharePoint page where the question was asked. */
export interface PageContext {
  url: string;
  title: string;
  siteUrl: string;
  listTitle?: string;
}

export interface Question {
  text: string;
  page: PageContext;
}

/** Document excerpt retrieved for a specific user (already filtered by permission). */
export interface Chunk {
  id: string;
  docId: string;
  title: string;
  url: string;
  text: string;
  score: number;
}

/** Citation as produced by the model: which chunk and the verbatim excerpt. */
export interface CitationDraft {
  chunkId: string;
  quote: string;
}

/** Citation returned to clients, validated against a retrieved chunk. */
export interface Citation extends CitationDraft {
  title: string;
  url: string;
}

/** Model output before grounding: citations are not yet validated. */
export interface DraftAnswer {
  text: string;
  citations: CitationDraft[];
  refused: boolean;
  promptVersion: string;
}

export interface Answer {
  text: string;
  citations: Citation[];
  /** true when there was not enough context and the assistant refused to answer. */
  refused: boolean;
  promptVersion: string;
}
