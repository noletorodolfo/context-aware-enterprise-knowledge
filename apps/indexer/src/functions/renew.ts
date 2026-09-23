import { app, type InvocationContext, type Timer } from "@azure/functions";
import { RENEW_WITHIN_MS, clientState, config, state, subscriptions } from "../dependencies.js";
import {
  clientStateFingerprint,
  planRenewals,
  type SubscriptionRecord,
} from "../handlers/renewal.js";

/**
 * Keeps the change notifications alive, and is also what bootstraps them: on an empty state it
 * creates every subscription, so the ingestion path starts working without a manual step. A
 * subscription that lapsed anyway is recreated here, and the next delta query reports everything
 * that changed while it was gone — freshness suffers, the index does not diverge.
 */
export async function renew(_timer: Timer, context: InvocationContext): Promise<void> {
  const drives = await subscriptions.drives(Object.keys(config.libraryAcl));
  const existing = await state.readSubscriptions();
  const plan = planRenewals(
    drives,
    existing,
    new Date(),
    RENEW_WITHIN_MS,
    clientStateFingerprint(clientState()),
  );

  const touched = new Set(
    [...plan.renew, ...plan.recreate, ...plan.remove].map((record) => record.subscriptionId),
  );
  const kept = existing.filter((record) => !touched.has(record.subscriptionId));
  const records: SubscriptionRecord[] = [...kept];
  let failures = 0;

  for (const drive of plan.create) {
    try {
      records.push(await subscriptions.create(drive));
    } catch (error) {
      failures += 1;
      context.error(
        JSON.stringify({
          event: "ingestion.subscription-failed",
          action: "create",
          library: drive.library,
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }
  }

  for (const record of plan.renew) {
    try {
      records.push(await subscriptions.renew(record));
    } catch (error) {
      // Renewal can fail because the subscription is already gone: recreate it on this same run.
      try {
        records.push(await subscriptions.create(record));
      } catch {
        failures += 1;
        context.error(
          JSON.stringify({
            event: "ingestion.subscription-failed",
            action: "renew",
            library: record.library,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      }
    }
  }

  // A rotated webhook secret cannot be applied to a live subscription: Graph only accepts a new
  // expiry on PATCH. Without this, every notification would be rejected until the subscription lapsed.
  for (const record of plan.recreate) {
    await subscriptions.remove(record.subscriptionId).catch(() => undefined);
    try {
      records.push(await subscriptions.create(record));
    } catch (error) {
      failures += 1;
      context.error(
        JSON.stringify({
          event: "ingestion.subscription-failed",
          action: "recreate",
          library: record.library,
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }
  }

  for (const record of plan.remove) {
    await subscriptions.remove(record.subscriptionId).catch(() => undefined);
  }

  await state.writeSubscriptions(records);

  context.log(
    JSON.stringify({
      event: "ingestion.subscriptions-reconciled",
      created: plan.create.length,
      renewed: plan.renew.length,
      recreated: plan.recreate.length,
      removed: plan.remove.length,
      live: records.length,
      failures,
    }),
  );
}

/**
 * Also on startup, which is what makes ingestion self-healing: a deployment, a restart or the first
 * cold start reconciles the subscriptions instead of waiting up to six hours. It is safe to run
 * often because it is idempotent — it creates what is missing, extends what is near expiry and
 * leaves the rest alone — and because the Functions host serializes timer executions with a lock,
 * so scaling out does not produce two runs creating the same subscription.
 *
 * It is also the only way to run it on demand: the host keys API that `/admin/functions/...` needs
 * is not available on Flex Consumption, so there is no manual trigger to fall back on.
 */
app.timer("renew", { schedule: "0 0 */6 * * *", runOnStartup: true, handler: renew });
