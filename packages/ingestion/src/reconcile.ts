/**
 * Full reconciliation: every current chunk is uploaded (create or replace) and anything left in the
 * index from a previous run is deleted. Deleted or renamed documents therefore leave the index.
 */
export function reconcile(
  existingIds: string[],
  nextIds: string[],
): { upload: string[]; delete: string[] } {
  const next = new Set(nextIds);
  return { upload: nextIds, delete: existingIds.filter((id) => !next.has(id)) };
}

export function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
