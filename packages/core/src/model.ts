/** Contexto da página do SharePoint onde a pergunta foi feita. */
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

/** Trecho de documento recuperado para um usuário específico (já filtrado por permissão). */
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
  /** true quando não havia contexto suficiente e o assistente se recusou a responder. */
  refused: boolean;
  promptVersion: string;
}
