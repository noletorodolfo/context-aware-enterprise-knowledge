import { describe, expect, it } from "vitest";
import type { SearchIndexClient } from "@kb/ingestion";
import { processEvent, type DriveState } from "./process-event.js";

const event = {
  specVersion: "1.0",
  type: "kb.document.changed",
  id: "evt-1",
  time: "2026-09-23T12:00:00.000Z",
  siteId: "site-1",
  driveId: "drive-1",
  library: "Políticas",
};

const deltaPage = (token: string) => ({
  value: [],
  "@odata.deltaLink": `https://graph.microsoft.com/v1.0/drives/drive-1/root/delta?token=${token}`,
});

function setup(state: DriveState = {}) {
  const saved: string[] = [];
  const search: SearchIndexClient = {
    createOrUpdateIndex: () => Promise.resolve(),
    listChunkIds: () => Promise.resolve([]),
    listChunkIdsForDocument: () => Promise.resolve([]),
    upload: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
  const fetchFn = ((url: string) => {
    if (url.includes("/delta")) {
      return Promise.resolve(
        new Response(JSON.stringify(deltaPage("T2")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    throw new Error(`unexpected request: ${url}`);
  }) as unknown as typeof fetch;

  const deps = {
    search,
    embed: (inputs: string[]) => Promise.resolve(inputs.map(() => [0.1])),
    aclGroupsFor: () => ["group-colaboradores"],
    graphToken: () => Promise.resolve("app-token"),
    driveWebUrl: () => Promise.resolve("https://contoso.sharepoint.com/sites/kb-demo/Politicas"),
    withDriveLock: <T>(_driveId: string, work: (s: DriveState) => Promise<T>) => work(state),
    saveDeltaToken: (_driveId: string, token: string) => {
      saved.push(token);
      return Promise.resolve();
    },
    fetchFn,
  };
  return { deps, saved };
}

describe("processEvent", () => {
  it("reads the delta and stores the new token", async () => {
    const { deps, saved } = setup({ deltaToken: "T1" });

    const result = await processEvent(event, deps);

    expect(saved).toEqual(["T2"]);
    expect(result.fullPass).toBe(false);
    expect(result.library).toBe("Políticas");
  });

  it("reports a first run as a full pass", async () => {
    const { deps } = setup();

    expect((await processEvent(event, deps)).fullPass).toBe(true);
  });

  it("rejects an event from an unknown contract version instead of indexing it", async () => {
    const { deps, saved } = setup();

    await expect(processEvent({ ...event, specVersion: "2.0" }, deps)).rejects.toThrow(
      /specVersion/,
    );
    expect(saved).toEqual([]);
  });

  it("does not advance the token when applying the changes failed", async () => {
    const { deps, saved } = setup({ deltaToken: "T1" });
    const failing = {
      ...deps,
      search: {
        ...deps.search,
        listChunkIdsForDocument: () => Promise.reject(new Error("search is down")),
      },
      // A deleted item reaches the index without a content download, so the failure under test is
      // the index write and nothing else.
      fetchFn: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              value: [{ id: "d1", name: "a.docx", deleted: { state: "deleted" } }],
              "@odata.deltaLink": "https://g/delta?token=T2",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )) as unknown as typeof fetch,
    };

    await expect(processEvent(event, failing)).rejects.toThrow(/search is down/);
    expect(saved).toEqual([]);
  });

  it("holds the drive lock around the whole pass", async () => {
    const { deps } = setup({ deltaToken: "T1" });
    const order: string[] = [];
    const locked = {
      ...deps,
      withDriveLock: async <T>(driveId: string, work: (s: DriveState) => Promise<T>) => {
        order.push(`lock:${driveId}`);
        const value = await work({ deltaToken: "T1" });
        order.push("release");
        return value;
      },
      saveDeltaToken: (_driveId: string, token: string) => {
        order.push(`save:${token}`);
        return Promise.resolve();
      },
    };

    await processEvent(event, locked);

    expect(order).toEqual(["lock:drive-1", "save:T2", "release"]);
  });
});
