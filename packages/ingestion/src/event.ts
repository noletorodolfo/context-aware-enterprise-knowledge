/**
 * The `DocumentChanged` v1 event, validated against `contracts/events/document-changed.v1.json`.
 * The event names a library, never a document: the consumer asks Graph what changed, so a replayed,
 * duplicated or out-of-order event can never describe stale content.
 */
export const DOCUMENT_CHANGED_TYPE = "kb.document.changed";
export const DOCUMENT_CHANGED_SPEC_VERSION = "1.0";

export interface DocumentChangedV1 {
  specVersion: typeof DOCUMENT_CHANGED_SPEC_VERSION;
  type: typeof DOCUMENT_CHANGED_TYPE;
  id: string;
  time: string;
  siteId: string;
  driveId: string;
  library: string;
  subscriptionId?: string;
  resource?: string;
}

const REQUIRED = ["id", "time", "siteId", "driveId", "library"] as const;

export class EventContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EventContractError";
  }
}

/**
 * Rejects anything this version does not understand instead of guessing. A poison message is a
 * better outcome than an event silently indexed under the wrong assumptions.
 */
export function parseDocumentChanged(raw: unknown): DocumentChangedV1 {
  if (typeof raw !== "object" || raw === null) {
    throw new EventContractError("event is not an object");
  }
  const event = raw as Partial<DocumentChangedV1>;
  if (event.specVersion !== DOCUMENT_CHANGED_SPEC_VERSION) {
    throw new EventContractError(`unsupported specVersion: ${String(event.specVersion)}`);
  }
  if (event.type !== DOCUMENT_CHANGED_TYPE) {
    throw new EventContractError(`unsupported type: ${String(event.type)}`);
  }
  for (const field of REQUIRED) {
    const value = event[field];
    if (typeof value !== "string" || value === "") {
      throw new EventContractError(`missing field: ${field}`);
    }
  }
  if (Number.isNaN(Date.parse(event.time as string))) {
    throw new EventContractError("time is not a date-time");
  }
  return event as DocumentChangedV1;
}
