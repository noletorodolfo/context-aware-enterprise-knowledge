import { describe, expect, it, vi } from "vitest";
import { applyChanges } from "./apply.js";
import { chunkId } from "./chunks.js";
import type { DeltaChange } from "./delta.js";
import type { SearchIndexClient } from "./search-client.js";

const file = (docId: string, sections: string[]) => ({
  docId,
  title: "politica-home-office",
  url: "https://contoso.sharepoint.com/sites/kb-demo/Politicas/politica-home-office.docx",
  library: "Politicas",
  sections: sections.map((text, index) => ({ heading: `H${index}`, text })),
});

function setup(existing: Record<string, string[]> = {}) {
  const uploaded: string[][] = [];
  const removed: string[][] = [];
  const search: SearchIndexClient = {
    createOrUpdateIndex: () => Promise.resolve(),
    listChunkIds: () => Promise.resolve(Object.values(existing).flat()),
    listChunkIdsForDocument: (docId) => Promise.resolve(existing[docId] ?? []),
    upload: (chunks) => {
      uploaded.push(chunks.map((chunk) => chunk.id));
      return Promise.resolve();
    },
    remove: (ids) => {
      removed.push(ids);
      return Promise.resolve();
    },
  };
  const deps = {
    search,
    embed: (inputs: string[]) => Promise.resolve(inputs.map(() => [0.1, 0.2, 0.3])),
    aclGroupsFor: () => ["group-colaboradores"],
  };
  return { deps, uploaded, removed };
}

describe("applyChanges", () => {
  it("indexes a changed document and reports what it did", async () => {
    const { deps, uploaded, removed } = setup();

    const result = await applyChanges(
      [{ docId: "d1", removed: false, file: file("d1", ["a", "b"]) }],
      deps,
    );

    expect(result).toEqual({
      documentsIndexed: 1,
      chunksUploaded: 2,
      chunksDeleted: 0,
      documentsRemoved: 0,
    });
    expect(uploaded).toEqual([[chunkId("d1", 0), chunkId("d1", 1)]]);
    expect(removed).toEqual([]);
  });

  it("replaces the same rows when the same change is processed twice", async () => {
    const change: DeltaChange = { docId: "d1", removed: false, file: file("d1", ["a", "b"]) };
    const first = setup();
    await applyChanges([change], first.deps);

    // Second delivery of the same event: the index already holds exactly these chunk ids.
    const second = setup({ d1: [chunkId("d1", 0), chunkId("d1", 1)] });
    const result = await applyChanges([change], second.deps);

    expect(second.uploaded).toEqual(first.uploaded);
    expect(second.removed).toEqual([]);
    expect(result.chunksDeleted).toBe(0);
  });

  it("deletes the sections a shortened document no longer has", async () => {
    const { deps, removed } = setup({
      d1: [chunkId("d1", 0), chunkId("d1", 1), chunkId("d1", 2)],
    });

    const result = await applyChanges(
      [{ docId: "d1", removed: false, file: file("d1", ["a"]) }],
      deps,
    );

    expect(removed).toEqual([[chunkId("d1", 1), chunkId("d1", 2)]]);
    expect(result.chunksDeleted).toBe(2);
  });

  it("removes every chunk of a deleted document", async () => {
    const { deps, removed, uploaded } = setup({ d1: [chunkId("d1", 0), chunkId("d1", 1)] });

    const result = await applyChanges([{ docId: "d1", removed: true }], deps);

    expect(removed).toEqual([[chunkId("d1", 0), chunkId("d1", 1)]]);
    expect(uploaded).toEqual([]);
    expect(result).toEqual({
      documentsIndexed: 0,
      chunksUploaded: 0,
      chunksDeleted: 2,
      documentsRemoved: 1,
    });
  });

  it("does not index a library whose groups cannot be resolved", async () => {
    const { deps, uploaded } = setup();
    const failing = {
      ...deps,
      aclGroupsFor: vi.fn(() => {
        throw new Error('library "Financeiro" has no aclGroups configured');
      }),
    };

    await expect(
      applyChanges(
        [{ docId: "d1", removed: false, file: { ...file("d1", ["a"]), library: "Financeiro" } }],
        failing,
      ),
    ).rejects.toThrow(/Financeiro/);
    expect(uploaded).toEqual([]);
  });
});
