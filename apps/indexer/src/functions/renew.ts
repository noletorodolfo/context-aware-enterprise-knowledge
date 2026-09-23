import { app, type InvocationContext, type Timer } from "@azure/functions";
import { RENEW_WITHIN_MS, config, state, subscriptions } from "../dependencies.js";
import { planRenewals, type SubscriptionRecord } from "../handlers/renewal.js";

/**
 * Keeps the change notifications alive, and is also what bootstraps them: on an empty state it
 * creates every subscription, so the ingestion path starts working without a manual step. A
 * subscription that lapsed anyway is recreated here, and the next delta query reports everything
 * that changed while it was gone — freshness suffers, the index does not diverge.
 */
export async function renew(_timer: Timer, context: InvocationContext): Promise<void> {
  const drives = await subscriptions.drives(Object.keys(config.libraryAcl));
  const existing = await state.readSubscriptions();
  const plan = planRenewals(drives, existing, new Date(), RENEW_WITHIN_MS);

  const kept = existing.filter(
    (record) =>
      !plan.renew.some((renewing) => renewing.subscriptionId === record.subscriptionId) &&
      !plan.remove.some((removing) => removing.subscriptionId === record.subscriptionId),
  );
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

  for (const record of plan.remove) {
    await subscriptions.remove(record.subscriptionId).catch(() => undefined);
  }

  await state.writeSubscriptions(records);

  context.log(
    JSON.stringify({
      event: "ingestion.subscriptions-reconciled",
      created: plan.create.length,
      renewed: plan.renew.length,
      removed: plan.remove.length,
      live: records.length,
      failures,
    }),
  );
}

app.timer("renew", { schedule: "0 0 */6 * * *", runOnStartup: false, handler: renew });
