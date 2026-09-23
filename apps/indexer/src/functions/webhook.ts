import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { handleNotification } from "../handlers/notification.js";
import { clientState, queue, state } from "../dependencies.js";

const DRIVE_MAP_TTL_MS = 60_000;
let cached: { at: number; byDrive: Map<string, { library: string; siteId: string }> } | undefined;

/** The subscription records are the only source of drives this deployment owns. */
async function driveMap(): Promise<Map<string, { library: string; siteId: string }>> {
  if (cached && Date.now() - cached.at < DRIVE_MAP_TTL_MS) return cached.byDrive;
  const records = await state.readSubscriptions();
  const byDrive = new Map(
    records.map((record) => [record.driveId, { library: record.library, siteId: record.siteId }]),
  );
  cached = { at: Date.now(), byDrive };
  return byDrive;
}

/**
 * Anonymous by necessity: Microsoft Graph cannot present an Entra token to a webhook, so the
 * subscription's `clientState` is what authenticates a notification. The endpoint does as little as
 * possible — validate, enqueue, acknowledge — because Graph retries on a slow response and the work
 * belongs to the queue consumer.
 */
export async function webhook(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Subscription handshake: Graph creates a subscription only if this token comes straight back.
  const validationToken = request.query.get("validationToken");
  if (validationToken) {
    return { status: 200, headers: { "Content-Type": "text/plain" }, body: validationToken };
  }

  const body: unknown = await request.json().catch(() => undefined);
  const byDrive = await driveMap();
  const result = handleNotification(body, {
    expectedClientState: clientState(),
    driveInfo: (driveId) => byDrive.get(driveId),
  });

  for (const event of result.events) {
    await queue.sendMessage(Buffer.from(JSON.stringify(event), "utf8").toString("base64"));
  }

  context.log(
    JSON.stringify({
      event: "ingestion.notified",
      accepted: result.events.length,
      rejectedClientState: result.rejected.clientState,
      rejectedUnknownDrive: result.rejected.unknownDrive,
      rejectedMalformed: result.rejected.malformed,
    }),
  );

  return { status: result.status, body: result.body };
}

app.http("webhook", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ingestion/notifications",
  handler: webhook,
});
