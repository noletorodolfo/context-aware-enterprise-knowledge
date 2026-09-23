import { describe, expect, it } from "vitest";
import { clientStateFingerprint, planRenewals, type SubscriptionRecord } from "./renewal.js";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const SECRET = clientStateFingerprint("current-secret");
const DAY = 24 * 60 * 60 * 1000;
const drive = { driveId: "drive-1", library: "Políticas", siteId: "site-1" };

const record = (overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  driveId: "drive-1",
  library: "Políticas",
  siteId: "site-1",
  subscriptionId: "sub-1",
  expiresAt: new Date(NOW.getTime() + 2 * DAY).toISOString(),
  clientStateFingerprint: SECRET,
  ...overrides,
});

describe("planRenewals", () => {
  it("creates a subscription for a library that has none", () => {
    const plan = planRenewals([drive], [], NOW, DAY, SECRET);

    expect(plan.create).toEqual([drive]);
    expect(plan.renew).toEqual([]);
  });

  it("leaves a subscription alone while it is comfortably valid", () => {
    const plan = planRenewals([drive], [record()], NOW, DAY, SECRET);

    expect(plan).toEqual({ create: [], renew: [], recreate: [], remove: [] });
  });

  it("renews a subscription inside the threshold", () => {
    const expiring = record({ expiresAt: new Date(NOW.getTime() + DAY / 2).toISOString() });

    expect(planRenewals([drive], [expiring], NOW, DAY, SECRET).renew).toEqual([expiring]);
  });

  it("renews one that already lapsed rather than ignoring it", () => {
    const lapsed = record({ expiresAt: new Date(NOW.getTime() - DAY).toISOString() });

    expect(planRenewals([drive], [lapsed], NOW, DAY, SECRET).renew).toEqual([lapsed]);
  });

  it("renews one whose stored expiry cannot be read", () => {
    const broken = record({ expiresAt: "soon" });

    expect(planRenewals([drive], [broken], NOW, DAY, SECRET).renew).toEqual([broken]);
  });

  it("removes a subscription for a library that is no longer configured", () => {
    const orphan = record({ driveId: "drive-9", library: "Financeiro" });

    const plan = planRenewals([drive], [record(), orphan], NOW, DAY, SECRET);

    expect(plan.remove).toEqual([orphan]);
    expect(plan.renew).toEqual([]);
  });

  it("recreates a subscription created with a secret that has since rotated", () => {
    const stale = record({ clientStateFingerprint: clientStateFingerprint("old-secret") });

    const plan = planRenewals([drive], [stale], NOW, DAY, SECRET);

    // Graph cannot change the clientState of a live subscription, so renewing it would leave every
    // notification rejected by the webhook.
    expect(plan.recreate).toEqual([stale]);
    expect(plan.renew).toEqual([]);
  });

  it("recreates a record written before fingerprints existed", () => {
    const legacy = record();
    delete legacy.clientStateFingerprint;

    expect(planRenewals([drive], [legacy], NOW, DAY, SECRET).recreate).toEqual([legacy]);
  });

  it("prefers recreating over renewing when both apply", () => {
    const stale = record({
      clientStateFingerprint: clientStateFingerprint("old-secret"),
      expiresAt: new Date(NOW.getTime() + DAY / 2).toISOString(),
    });

    const plan = planRenewals([drive], [stale], NOW, DAY, SECRET);

    expect(plan.recreate).toEqual([stale]);
    expect(plan.renew).toEqual([]);
  });
});

describe("clientStateFingerprint", () => {
  it("is stable and does not contain the secret", () => {
    const fingerprint = clientStateFingerprint("a-very-secret-value");

    expect(fingerprint).toBe(clientStateFingerprint("a-very-secret-value"));
    expect(fingerprint).not.toContain("secret");
    expect(fingerprint).toHaveLength(16);
  });

  it("changes when the secret changes", () => {
    expect(clientStateFingerprint("one")).not.toBe(clientStateFingerprint("two"));
  });
});
