import { withSpan } from "@kb/core";
import {
  applyChanges,
  parseDocumentChanged,
  readDelta,
  type ApplyResult,
  type SearchIndexClient,
} from "@kb/ingestion";

export interface DriveState {
  deltaToken?: string;
}

export interface ProcessDeps {
  search: SearchIndexClient;
  embed: (inputs: string[]) => Promise<number[][]>;
  aclGroupsFor: (library: string) => string[];
  graphToken: () => Promise<string>;
  /** Drive metadata needed to build citation URLs identical to the Graph retriever's. */
  driveWebUrl: (driveId: string, token: string) => Promise<string | undefined>;
  /**
   * Runs `work` while holding an exclusive lease on the drive's state, so two events for the same
   * drive cannot read the same delta token and each miss what the other consumed.
   */
  withDriveLock: <T>(driveId: string, work: (state: DriveState) => Promise<T>) => Promise<T>;
  saveDeltaToken: (driveId: string, deltaToken: string) => Promise<void>;
  fetchFn?: typeof fetch;
}

export interface ProcessResult extends ApplyResult {
  library: string;
  driveId: string;
  changes: number;
  skipped: number;
  /** A first run, or one after a lost or expired token: the whole drive is read again. */
  fullPass: boolean;
}

/**
 * Consumes one `DocumentChanged` event.
 *
 * The event is a trigger, not data: everything indexed comes from a delta query issued now, with
 * the stored token. Re-delivering an event therefore re-reads from the same point and rewrites the
 * same rows, and the token only advances after the changes it described were applied — a crash
 * between the two leaves the event to be retried, never silently skipped.
 */
export function processEvent(raw: unknown, deps: ProcessDeps): Promise<ProcessResult> {
  return withSpan("ingestion.process", {}, async (span) => {
    const event = parseDocumentChanged(raw);
    span.setAttribute("kb.library", event.library);

    return deps.withDriveLock(event.driveId, async (state) => {
      const token = await deps.graphToken();
      const webUrl = await deps.driveWebUrl(event.driveId, token);
      const page = await readDelta(
        event.driveId,
        event.library,
        webUrl,
        token,
        state.deltaToken,
        deps.fetchFn,
      );
      span.setAttribute("kb.delta.changes", page.changes.length);

      const applied = await applyChanges(page.changes, {
        search: deps.search,
        embed: deps.embed,
        aclGroupsFor: deps.aclGroupsFor,
      });

      // Only now: a token saved before the upload would skip changes the crash left unapplied.
      if (page.deltaToken) await deps.saveDeltaToken(event.driveId, page.deltaToken);

      return {
        ...applied,
        library: event.library,
        driveId: event.driveId,
        changes: page.changes.length,
        skipped: page.skipped,
        fullPass: state.deltaToken === undefined,
      };
    });
  });
}
