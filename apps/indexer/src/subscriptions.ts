import { clientStateFingerprint, type Drive, type SubscriptionRecord } from "./handlers/renewal.js";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface SubscriptionClient {
  create(drive: Drive): Promise<SubscriptionRecord>;
  renew(record: SubscriptionRecord): Promise<SubscriptionRecord>;
  remove(subscriptionId: string): Promise<void>;
  /** Resolves the drives of the configured libraries, and their site, from the site URL. */
  drives(libraries: string[]): Promise<Drive[]>;
  driveWebUrl(driveId: string): Promise<string | undefined>;
}

export interface SubscriptionClientOptions {
  siteUrl: string;
  notificationUrl: string;
  clientState: string;
  /** How long each subscription asks to live. Short on purpose; see planRenewals. */
  lifetimeMs: number;
  token: () => Promise<string>;
  now?: () => Date;
  fetchFn?: typeof fetch;
}

export function createSubscriptionClient(options: SubscriptionClientOptions): SubscriptionClient {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => new Date());

  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await options.token();
    const response = await fetchFn(`${GRAPH}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Graph ${init.method ?? "GET"} ${path} failed: ${response.status}`);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };

  const expiration = () => new Date(now().getTime() + options.lifetimeMs).toISOString();

  const record = (
    drive: Drive,
    subscription: { id?: string; expirationDateTime?: string },
  ): SubscriptionRecord => {
    if (!subscription.id) throw new Error("Graph returned a subscription without an id");
    return {
      driveId: drive.driveId,
      library: drive.library,
      siteId: drive.siteId,
      subscriptionId: subscription.id,
      expiresAt: subscription.expirationDateTime ?? expiration(),
      clientStateFingerprint: clientStateFingerprint(options.clientState),
    };
  };

  return {
    drives: async (libraries) => {
      const url = new URL(options.siteUrl);
      const address = `${url.hostname}:${url.pathname.replace(/\/+$/, "")}`;
      const site = await request<{ id: string }>(`/sites/${address}`);
      const drives = await request<{ value: { id: string; name: string }[] }>(
        `/sites/${site.id}/drives`,
      );
      return libraries.map((library) => {
        const drive = drives.value.find((candidate) => candidate.name === library);
        if (!drive) throw new Error(`Library "${library}" was not found on the site`);
        return { driveId: drive.id, library, siteId: site.id };
      });
    },

    driveWebUrl: async (driveId) =>
      (await request<{ webUrl?: string }>(`/drives/${driveId}`)).webUrl,

    create: async (drive) =>
      record(
        drive,
        await request<{ id?: string; expirationDateTime?: string }>("/subscriptions", {
          method: "POST",
          body: JSON.stringify({
            changeType: "updated",
            notificationUrl: options.notificationUrl,
            resource: `drives/${drive.driveId}/root`,
            expirationDateTime: expiration(),
            clientState: options.clientState,
          }),
        }),
      ),

    renew: async (existing) =>
      record(
        existing,
        await request<{ id?: string; expirationDateTime?: string }>(
          `/subscriptions/${existing.subscriptionId}`,
          { method: "PATCH", body: JSON.stringify({ expirationDateTime: expiration() }) },
        ),
      ),

    remove: async (subscriptionId) => {
      await request(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    },
  };
}
