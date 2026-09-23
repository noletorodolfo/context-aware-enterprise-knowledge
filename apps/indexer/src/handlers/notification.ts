import {
  DOCUMENT_CHANGED_SPEC_VERSION,
  DOCUMENT_CHANGED_TYPE,
  type DocumentChangedV1,
} from "@kb/ingestion";

/** One Microsoft Graph change notification, reduced to the fields this service trusts. */
interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  resource?: string;
  tenantId?: string;
}

export interface NotificationResult {
  status: number;
  /** Plain-text body Graph expects for the validation handshake; empty otherwise. */
  body: string;
  events: DocumentChangedV1[];
  /** Notifications dropped, by reason, for telemetry. Never carries the value that failed. */
  rejected: { clientState: number; unknownDrive: number; malformed: number };
}

export interface NotificationDeps {
  /** The secret the subscription was created with; compared in constant time. */
  expectedClientState: string;
  /** Drive id to its library and site, written by the renewal function with the subscription. */
  driveInfo: (driveId: string) => { library: string; siteId: string } | undefined;
  now?: () => Date;
  newId?: (notification: GraphNotification, driveId: string) => string;
}

const DRIVE_RESOURCE = /(?:^|\/)drives\/([^/]+)/i;

/** Timing-safe comparison without leaking length through an early return. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let index = 0; index < a.length; index += 1) {
    differences |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return differences === 0;
}

/**
 * Turns a Graph change notification into `DocumentChanged` v1 events.
 *
 * The endpoint is anonymous because Graph cannot authenticate to it, so `clientState` is the only
 * proof the caller is the subscription's owner: a notification without it is dropped, and the
 * response never says why. Nothing from the payload reaches the index — the event carries the
 * library, and the consumer asks Graph what actually changed.
 */
export function handleNotification(raw: unknown, deps: NotificationDeps): NotificationResult {
  const result: NotificationResult = {
    status: 202,
    body: "",
    events: [],
    rejected: { clientState: 0, unknownDrive: 0, malformed: 0 },
  };
  const now = deps.now ?? (() => new Date());

  const notifications = (raw as { value?: unknown })?.value;
  if (!Array.isArray(notifications)) {
    return { ...result, status: 400, rejected: { ...result.rejected, malformed: 1 } };
  }

  for (const entry of notifications) {
    const notification = entry as GraphNotification;
    if (
      typeof notification.clientState !== "string" ||
      !sameSecret(notification.clientState, deps.expectedClientState)
    ) {
      result.rejected.clientState += 1;
      continue;
    }
    const driveId = DRIVE_RESOURCE.exec(notification.resource ?? "")?.[1];
    if (!driveId) {
      result.rejected.malformed += 1;
      continue;
    }
    const drive = deps.driveInfo(driveId);
    if (!drive) {
      // A subscription this deployment does not own, or one left over from a removed library.
      result.rejected.unknownDrive += 1;
      continue;
    }
    result.events.push({
      specVersion: DOCUMENT_CHANGED_SPEC_VERSION,
      type: DOCUMENT_CHANGED_TYPE,
      id: (deps.newId ?? defaultId)(notification, driveId),
      time: now().toISOString(),
      siteId: drive.siteId,
      driveId,
      library: drive.library,
      ...(notification.subscriptionId ? { subscriptionId: notification.subscriptionId } : {}),
      ...(notification.resource ? { resource: notification.resource } : {}),
    });
  }

  return result;
}

const defaultId = (notification: GraphNotification, driveId: string) =>
  `${notification.subscriptionId ?? driveId}:${Date.now()}`;
