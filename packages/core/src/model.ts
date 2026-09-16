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

export interface Citation {
  chunkId: string;
  quote: string;
}

export interface Answer {
  text: string;
  citations: Citation[];
  /** true when there was not enough context and the assistant refused to answer. */
  refused: boolean;
  promptVersion: string;
}
