/**
 * Retries for throttling only (Azure OpenAI 429, surfaced by the API as 503). The shared
 * deployment has a small tokens-per-minute quota; waiting measures the assistant, not the quota.
 */
export interface RetryPolicy {
  /** Total attempts, including the first one. */
  attempts: number;
  /** Wait before retry n is n × delayMs. */
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export const NO_RETRY: RetryPolicy = { attempts: 1, delayMs: 0 };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Calls `fn` until `shouldRetry` is false or attempts run out; returns the last result. */
export async function withRetry<T>(
  policy: RetryPolicy,
  fn: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
): Promise<{ result: T; attempts: number }> {
  const sleep = policy.sleep ?? defaultSleep;
  let attempts = 1;
  let result = await fn();
  while (shouldRetry(result) && attempts < policy.attempts) {
    await sleep(policy.delayMs * attempts);
    attempts += 1;
    result = await fn();
  }
  return { result, attempts };
}
