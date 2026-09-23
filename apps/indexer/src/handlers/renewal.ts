import { createHash } from "node:crypto";

/**
 * Identifies which secret a subscription was created with, without storing the secret. Rotating the
 * webhook secret leaves every live subscription echoing the old one, and the webhook would reject
 * every notification: a mismatch has to force a recreation, not a renewal.
 */
export function clientStateFingerprint(clientState: string): string {
  return createHash("sha256").update(clientState).digest("base64url").slice(0, 16);
}

/** A subscription this deployment keeps alive, as stored in the ingestion state. */
export interface SubscriptionRecord {
  driveId: string;
  library: string;
  siteId: string;
  subscriptionId: string;
  /** ISO 8601, as Graph returned it. */
  expiresAt: string;
  /** Fingerprint of the clientState this subscription carries; absent in records written before it. */
  clientStateFingerprint?: string;
}

export interface RenewalPlan {
  /** Libraries with no live subscription: one must be created. */
  create: { driveId: string; library: string; siteId: string }[];
  /** Subscriptions close enough to expiry that they must be extended now. */
  renew: SubscriptionRecord[];
  /**
   * Subscriptions carrying a clientState that is no longer the current one. Graph cannot change the
   * clientState of a live subscription, so these are deleted and created again.
   */
  recreate: SubscriptionRecord[];
  /** Records for drives that are no longer configured: the subscription must be deleted. */
  remove: SubscriptionRecord[];
}

export interface Drive {
  driveId: string;
  library: string;
  siteId: string;
}

/**
 * Decides what the renewal run must do. Subscriptions are short-lived on purpose: a conservative
 * expiry that every Graph resource type accepts, renewed well before it lapses, is worth more than
 * the longest expiry a resource might allow. A lapsed subscription is not a gap in the index — the
 * next run recreates it and the delta query then reports everything missed in the meantime — but it
 * is a gap in freshness, so the threshold is generous.
 */
export function planRenewals(
  drives: Drive[],
  records: SubscriptionRecord[],
  now: Date,
  renewWithinMs: number,
  currentFingerprint: string,
): RenewalPlan {
  const byDrive = new Map(records.map((record) => [record.driveId, record]));
  const configured = new Set(drives.map((drive) => drive.driveId));

  const create: RenewalPlan["create"] = [];
  const renew: SubscriptionRecord[] = [];
  const recreate: SubscriptionRecord[] = [];

  for (const drive of drives) {
    const record = byDrive.get(drive.driveId);
    if (!record) {
      create.push(drive);
      continue;
    }
    if (record.clientStateFingerprint !== currentFingerprint) {
      recreate.push(record);
      continue;
    }
    const expiry = Date.parse(record.expiresAt);
    if (Number.isNaN(expiry) || expiry - now.getTime() <= renewWithinMs) {
      renew.push(record);
    }
  }

  return {
    create,
    renew,
    recreate,
    remove: records.filter((record) => !configured.has(record.driveId)),
  };
}
