import { createHash } from "node:crypto";
import type { Section } from "@kb/retrievers";

export interface IndexedDocument {
  docId: string;
  title: string;
  url: string;
  library: string;
  /** Entra group object ids allowed to read this document. */
  aclGroups: string[];
  sections: Section[];
}

export interface SearchChunk {
  id: string;
  docId: string;
  title: string;
  url: string;
  library: string;
  section: string;
  content: string;
  aclGroups: string[];
  /** Text sent to the embeddings model; not stored in the index. */
  embeddingInput: string;
}

/**
 * Azure AI Search keys accept letters, digits, `_`, `-` and `=` only, while Graph drive item ids
 * contain `!`, `.` and `%`. A short hash of the raw id keeps keys unique and stable across runs.
 */
export function chunkId(docId: string, sectionIndex: number): string {
  const digest = createHash("sha256").update(docId).digest("base64url").slice(0, 16);
  return `${digest}-${sectionIndex}`;
}

/** One chunk per non-empty section, carrying the document's metadata and permissions. */
export function buildChunks(documents: IndexedDocument[]): SearchChunk[] {
  return documents.flatMap((document) => {
    if (document.aclGroups.length === 0) {
      throw new Error(`${document.title}: aclGroups is empty; refusing to index it unprotected`);
    }
    return document.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section.text.trim() !== "")
      .map(({ section, index }) => ({
        id: chunkId(document.docId, index),
        docId: document.docId,
        title: document.title,
        url: document.url,
        library: document.library,
        section: section.heading,
        content: section.text,
        aclGroups: document.aclGroups,
        embeddingInput: [document.title, section.heading, section.text]
          .filter((part) => part !== "")
          .join("\n"),
      }));
  });
}
