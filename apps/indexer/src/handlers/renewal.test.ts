import { describe, expect, it } from "vitest";
import { planRenewals, type SubscriptionRecord } from "./renewal.js";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const drive = { driveId: "drive-1", library: "Políticas", siteId: "site-1" };

const record = (overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  driveId: "drive-1",
  library: "Políticas",
  siteId: "site-1",
  subscriptionId: "sub-1",
  expiresAt: new Date(NOW.getTime() + 2 * DAY).toISOString(),
  ...overrides,
});

describe("planRenewals", () => {
  it("creates a subscription for a library that has none", () => {
    const plan = planRenewals([drive], [], NOW, DAY);

    expect(plan.create).toEqual([drive]);
    expect(plan.renew).toEqual([]);
  });

  it("leaves a subscription alone while it is comfortably valid", () => {
    const plan = planRenewals([drive], [record()], NOW, DAY);

    expect(plan).toEqual({ create: [], renew: [], remove: [] });
  });

  it("renews a subscription inside the threshold", () => {
    const expiring = record({ expiresAt: new Date(NOW.getTime() + DAY / 2).toISOString() });

    expect(planRenewals([drive], [expiring], NOW, DAY).renew).toEqual([expiring]);
  });

  it("renews one that already lapsed rather than ignoring it", () => {
    const lapsed = record({ expiresAt: new Date(NOW.getTime() - DAY).toISOString() });

    expect(planRenewals([drive], [lapsed], NOW, DAY).renew).toEqual([lapsed]);
  });

  it("renews one whose stored expiry cannot be read", () => {
    const broken = record({ expiresAt: "soon" });

    expect(planRenewals([drive], [broken], NOW, DAY).renew).toEqual([broken]);
  });

  it("removes a subscription for a library that is no longer configured", () => {
    const orphan = record({ driveId: "drive-9", library: "Financeiro" });

    const plan = planRenewals([drive], [record(), orphan], NOW, DAY);

    expect(plan.remove).toEqual([orphan]);
    expect(plan.renew).toEqual([]);
  });
});
