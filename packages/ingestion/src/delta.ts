import { extractSections } from "@kb/retrievers";
import { documentUrl, type LibraryFile } from "./graph.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

/** What a delta page says happened to one item since the stored token. */
export interface DeltaChange {
  docId: string;
  /** A deleted, renamed-away or now-unreadable item: its chunks must leave the index. */
  removed: boolean;
  file?: LibraryFile;
}

export interface DeltaPage {
  changes: DeltaChange[];
  /** Token to store and pass to the next call. Absent only when Graph returned none. */
  deltaToken?: string;
  /** Items ignored on purpose (folders, non-docx, unreadable content). */
  skipped: number;
}

interface DeltaItem {
  id?: string;
  name?: string;
  webUrl?: string;
  deleted?: { state?: string };
  file?: { mimeType?: string };
  folder?: unknown;
}

interface DeltaResponse {
  value?: DeltaItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

const tokenFromLink = (link: string | undefined): string | undefined => {
  if (!link) return undefined;
  const token = new URL(link).searchParams.get("token");
  return token ?? undefined;
};

/**
 * Reads everything that changed in one drive since `deltaToken`, following pages to the end, and
 * returns the new token. A missing token means "from the beginning", which is also what Graph
 * demands after a token expires, so a lost token degrades to a full pass rather than to a gap.
 *
 * Deletions arrive as changes too, which is why deletion needs no separate mechanism: the consumer
 * removes the chunks of every item marked removed.
 */
export async function readDelta(
  driveId: string,
  library: string,
  driveWebUrl: string | undefined,
  token: string,
  deltaToken: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<DeltaPage> {
  const changes: DeltaChange[] = [];
  let skipped = 0;
  let url = deltaToken
    ? `${GRAPH}/drives/${driveId}/root/delta?token=${encodeURIComponent(deltaToken)}`
    : `${GRAPH}/drives/${driveId}/root/delta`;
  let deltaLink: string | undefined;

  for (;;) {
    const response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Graph delta for drive failed: ${response.status}`);
    }
    const page = (await response.json()) as DeltaResponse;

    for (const item of page.value ?? []) {
      if (!item.id) {
        skipped += 1;
        continue;
      }
      if (item.deleted) {
        changes.push({ docId: item.id, removed: true });
        continue;
      }
      const name = item.name ?? "";
      if (item.folder !== undefined || !name.toLowerCase().endsWith(".docx")) {
        skipped += 1;
        continue;
      }
      const content = await fetchFn(`${GRAPH}/drives/${driveId}/items/${item.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!content.ok) {
        // A file that cannot be read any more (moved, permission changed) leaves the index.
        changes.push({ docId: item.id, removed: true });
        skipped += 1;
        continue;
      }
      changes.push({
        docId: item.id,
        removed: false,
        file: {
          docId: item.id,
          title: name.replace(/\.docx$/i, ""),
          url: documentUrl(driveWebUrl, name, item.webUrl ?? ""),
          library,
          sections: await extractSections(Buffer.from(await content.arrayBuffer())),
        },
      });
    }

    const next = page["@odata.nextLink"];
    deltaLink = page["@odata.deltaLink"] ?? deltaLink;
    if (!next) break;
    url = next;
  }

  const nextToken = tokenFromLink(deltaLink);
  return { changes, skipped, ...(nextToken ? { deltaToken: nextToken } : {}) };
}
