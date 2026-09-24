import { extractSections, type Section } from "@kb/retrievers";
import { libraryKey } from "./library-name.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface LibraryFile {
  docId: string;
  title: string;
  url: string;
  library: string;
  sections: Section[];
}

interface DriveItem {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  file?: { mimeType?: string };
}

async function graph<T>(path: string, token: string, fetchFn: typeof fetch): Promise<T> {
  const response = await fetchFn(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Graph GET ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The drive listing returns `webUrl` as `.../_layouts/15/Doc.aspx?sourcedoc=...`, while Graph
 * Search returns the path form `.../<library>/<file>.docx`. Both retrievers must cite the same
 * URL, and only the path form names the library, so the path form is rebuilt from the drive.
 */
export function documentUrl(
  driveWebUrl: string | undefined,
  name: string,
  fallback: string,
): string {
  if (!driveWebUrl) return fallback;
  return `${driveWebUrl.replace(/[/]+$/, "")}/${encodeURIComponent(name)}`;
}

/** `https://host/sites/name` becomes the Graph site address `host:/sites/name`. */
export function siteAddress(siteUrl: string): string {
  const url = new URL(siteUrl);
  return `${url.hostname}:${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Reads every `.docx` of the given libraries with the operator's delegated token and splits each
 * file into the same sections the runtime retriever uses.
 */
export async function readLibraries(
  siteUrl: string,
  libraries: string[],
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ files: LibraryFile[]; skipped: number }> {
  const site = await graph<{ id: string }>(`/sites/${siteAddress(siteUrl)}`, token, fetchFn);
  const drives = await graph<{ value: { id: string; name: string; webUrl?: string }[] }>(
    `/sites/${site.id}/drives`,
    token,
    fetchFn,
  );

  const files: LibraryFile[] = [];
  let skipped = 0;

  for (const library of libraries) {
    const drive = drives.value.find(
      (candidate) => libraryKey(candidate.name) === libraryKey(library),
    );
    if (!drive) throw new Error(`Library "${library}" was not found on the site`);

    const children = await graph<{ value: DriveItem[] }>(
      `/drives/${drive.id}/root/children?$top=200`,
      token,
      fetchFn,
    );

    for (const item of children.value) {
      const name = item.name ?? "";
      if (!item.id || !item.webUrl || !name.toLowerCase().endsWith(".docx")) {
        skipped += 1;
        continue;
      }
      const response = await fetchFn(`${GRAPH}/drives/${drive.id}/items/${item.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        skipped += 1;
        continue;
      }
      const sections = await extractSections(Buffer.from(await response.arrayBuffer()));
      files.push({
        docId: item.id,
        title: name.replace(/\.docx$/i, ""),
        url: documentUrl(drive.webUrl, name, item.webUrl),
        library,
        sections,
      });
    }
  }

  return { files, skipped };
}
