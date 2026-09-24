/**
 * SharePoint library names carry accents (`Políticas`), and those accents have to survive every hop
 * between the configuration and the runtime: a Terraform variable, a GitHub secret, a shell writing
 * a file, an app setting. One hop reading UTF-8 as a single-byte encoding is enough to turn the name
 * into `PolÃ­ticas`, and the failure is silent until a library stops being indexed.
 *
 * Matching on a normalized key removes the accents from the contract: the configuration may spell
 * the library in plain ASCII and still match what SharePoint reports.
 */
export function libraryKey(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

/** Finds an entry whose key matches `name` ignoring accents and case. */
export function findByLibraryName<T>(
  entries: Record<string, T>,
  name: string,
): { key: string; value: T } | undefined {
  const wanted = libraryKey(name);
  for (const [key, value] of Object.entries(entries)) {
    if (libraryKey(key) === wanted) return { key, value };
  }
  return undefined;
}

/**
 * Two libraries whose names differ only by accent or case would become the same key, and one would
 * silently take the other's permissions. Refuse that instead of guessing.
 */
export function assertDistinctLibraryNames(names: string[]): void {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = libraryKey(name);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new Error(
        `libraries "${previous}" and "${name}" are the same name once accents and case are ignored`,
      );
    }
    seen.set(key, name);
  }
}
