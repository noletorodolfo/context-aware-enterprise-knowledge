import type { TokenCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { DriveState } from "./handlers/process-event.js";
import type { SubscriptionRecord } from "./handlers/renewal.js";

const LEASE_SECONDS = 60;
const CONTAINER = "ingestion-state";
const SUBSCRIPTIONS_BLOB = "subscriptions.json";
const deltaBlob = (driveId: string) => `delta/${encodeURIComponent(driveId)}.json`;

export interface IngestionState {
  /**
   * Runs `work` while holding a lease on the drive's state blob. A second consumer of the same
   * drive fails to take the lease and throws, so its message returns to the queue instead of
   * reading a delta token another pass is about to replace.
   */
  withDriveLock<T>(driveId: string, work: (state: DriveState) => Promise<T>): Promise<T>;
  saveDeltaToken(driveId: string, deltaToken: string): Promise<void>;
  clearDeltaTokens(): Promise<number>;
  readSubscriptions(): Promise<SubscriptionRecord[]>;
  writeSubscriptions(records: SubscriptionRecord[]): Promise<void>;
}

export function createIngestionState(
  accountUrl: string,
  credential: TokenCredential,
): IngestionState {
  const service = new BlobServiceClient(accountUrl, credential);
  const container = service.getContainerClient(CONTAINER);
  let ready: Promise<ContainerClient> | undefined;

  const containerClient = () => {
    ready ??= container.createIfNotExists().then(() => container);
    return ready;
  };

  const readJson = async <T>(name: string, fallback: T): Promise<T> => {
    const blob = (await containerClient()).getBlockBlobClient(name);
    try {
      const buffer = await blob.downloadToBuffer();
      return JSON.parse(buffer.toString("utf8")) as T;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return fallback;
      throw error;
    }
  };

  const writeJson = async (name: string, value: unknown, leaseId?: string): Promise<void> => {
    const blob = (await containerClient()).getBlockBlobClient(name);
    const body = JSON.stringify(value);
    await blob.upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: "application/json" },
      ...(leaseId ? { conditions: { leaseId } } : {}),
    });
  };

  const leases = new Map<string, string>();

  return {
    withDriveLock: async (driveId, work) => {
      const name = deltaBlob(driveId);
      const blob = (await containerClient()).getBlockBlobClient(name);
      // A blob can only be leased once it exists; an empty state is the initial full pass.
      if (!(await blob.exists())) await writeJson(name, {});
      const lease = blob.getBlobLeaseClient();
      await lease.acquireLease(LEASE_SECONDS);
      leases.set(driveId, lease.leaseId);
      try {
        return await work(await readJson<DriveState>(name, {}));
      } finally {
        leases.delete(driveId);
        await lease.releaseLease().catch(() => undefined);
      }
    },

    saveDeltaToken: (driveId, deltaToken) =>
      writeJson(deltaBlob(driveId), { deltaToken }, leases.get(driveId)),

    clearDeltaTokens: async () => {
      const client = await containerClient();
      let deleted = 0;
      for await (const blob of client.listBlobsFlat({ prefix: "delta/" })) {
        await client.getBlockBlobClient(blob.name).deleteIfExists();
        deleted += 1;
      }
      return deleted;
    },

    readSubscriptions: () => readJson<SubscriptionRecord[]>(SUBSCRIPTIONS_BLOB, []),
    writeSubscriptions: (records) => writeJson(SUBSCRIPTIONS_BLOB, records),
  };
}
