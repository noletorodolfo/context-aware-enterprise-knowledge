// Wire contract of POST /api/ask. Duplicated from @kb/core on purpose (SPFx builds outside the
// npm workspaces); apps/knowledge-api/contract-check.ts fails the typecheck if they drift.

export interface PageContextDto {
  url: string;
  title: string;
  siteUrl: string;
  listTitle?: string;
}

export interface AskRequest {
  question: string;
  page: PageContextDto;
}

export interface CitationDto {
  chunkId: string;
  quote: string;
}

export interface AskResponse {
  text: string;
  citations: CitationDto[];
  refused: boolean;
  promptVersion: string;
}
