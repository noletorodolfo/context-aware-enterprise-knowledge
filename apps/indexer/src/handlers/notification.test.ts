import { describe, expect, it } from "vitest";
import { handleNotification } from "./notification.js";

const SECRET = "shared-client-state";
const deps = {
  expectedClientState: SECRET,
  driveInfo: (driveId: string) =>
    driveId === "drive-1" ? { library: "Políticas", siteId: "site-1" } : undefined,
  now: () => new Date("2026-09-23T12:00:00.000Z"),
  newId: () => "evt-1",
};

const notification = (overrides: Record<string, unknown> = {}) => ({
  value: [
    {
      subscriptionId: "sub-1",
      clientState: SECRET,
      resource: "drives/drive-1/root",
      ...overrides,
    },
  ],
});

describe("handleNotification", () => {
  it("emits one v1 event per accepted notification", () => {
    const result = handleNotification(notification(), deps);

    expect(result.status).toBe(202);
    expect(result.events).toEqual([
      {
        specVersion: "1.0",
        type: "kb.document.changed",
        id: "evt-1",
        time: "2026-09-23T12:00:00.000Z",
        siteId: "site-1",
        driveId: "drive-1",
        library: "Políticas",
        subscriptionId: "sub-1",
        resource: "drives/drive-1/root",
      },
    ]);
  });

  it("drops a notification with the wrong clientState and says nothing about it", () => {
    const result = handleNotification(notification({ clientState: "guessed" }), deps);

    expect(result.events).toEqual([]);
    expect(result.rejected.clientState).toBe(1);
    expect(result.status).toBe(202);
    expect(result.body).toBe("");
  });

  it("drops a notification with no clientState at all", () => {
    const result = handleNotification(notification({ clientState: undefined }), deps);

    expect(result.events).toEqual([]);
    expect(result.rejected.clientState).toBe(1);
  });

  it("drops a notification for a drive this deployment does not own", () => {
    const result = handleNotification(notification({ resource: "drives/other/root" }), deps);

    expect(result.events).toEqual([]);
    expect(result.rejected.unknownDrive).toBe(1);
  });

  it("drops a notification whose resource names no drive", () => {
    const result = handleNotification(notification({ resource: "sites/site-1/lists/x" }), deps);

    expect(result.rejected.malformed).toBe(1);
  });

  it("rejects a body that is not a notification collection", () => {
    expect(handleNotification({ nope: true }, deps).status).toBe(400);
  });

  it("accepts several notifications in one delivery", () => {
    const result = handleNotification(
      { value: [notification().value[0], notification().value[0]] },
      deps,
    );

    expect(result.events).toHaveLength(2);
  });
});
