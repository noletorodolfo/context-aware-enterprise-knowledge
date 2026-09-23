import { app, type InvocationContext } from "@azure/functions";
import {
  config,
  embed,
  graphToken,
  libraryGroups,
  search,
  state,
  subscriptions,
} from "../dependencies.js";
import { processEvent } from "../handlers/process-event.js";

/**
 * Queue consumer. Anything that throws goes back to the queue and, after `maxDequeueCount`
 * attempts, to `<queue>-poison`: a message the service cannot understand or apply must stop being
 * retried and stay inspectable, rather than disappear.
 */
export async function processMessage(message: unknown, context: InvocationContext): Promise<void> {
  const result = await processEvent(message, {
    search,
    embed,
    aclGroupsFor: libraryGroups,
    graphToken,
    driveWebUrl: (driveId) => subscriptions.driveWebUrl(driveId),
    withDriveLock: (driveId, work) => state.withDriveLock(driveId, work),
    saveDeltaToken: (driveId, token) => state.saveDeltaToken(driveId, token),
  });

  context.log(
    JSON.stringify({
      event: "ingestion.processed",
      library: result.library,
      changes: result.changes,
      documentsIndexed: result.documentsIndexed,
      documentsRemoved: result.documentsRemoved,
      chunksUploaded: result.chunksUploaded,
      chunksDeleted: result.chunksDeleted,
      skipped: result.skipped,
      fullPass: result.fullPass,
    }),
  );
}

app.storageQueue("process", {
  queueName: config.queueName,
  connection: "INGESTION_STORAGE",
  handler: processMessage,
});
