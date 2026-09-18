import type { AskResponse } from "@kb/core";
import type { AskClient } from "./clients.js";
import { usersOf, type EvalUser, type GoldenCase } from "./golden-set.js";
import type { Judge } from "./judge.js";
import type { Execution } from "./metrics.js";
import { NO_RETRY, withRetry, type RetryPolicy } from "./retry.js";

export class MissingDiagnosticsError extends Error {
  public constructor() {
    super(
      "The API returned no diagnostics: the token lacks the Evaluator app role. " +
        "Delete the token caches (apps/knowledge-api/e2e/.token-cache-*.json) and sign in again.",
    );
    this.name = "MissingDiagnosticsError";
  }
}

export interface RunOptions {
  judge?: Judge;
  /** Abort on the first answer without diagnostics (real runs: the role is required). */
  requireDiagnostics?: boolean;
  /** Retries API calls that fail with 429/503 (throttling). */
  retry?: RetryPolicy;
  onExecution?: (execution: Execution, index: number, total: number) => void;
}

/** Asks every case as its users, sequentially, and judges the answered ones. */
export async function runEvaluation(
  cases: GoldenCase[],
  ask: AskClient,
  options: RunOptions = {},
): Promise<Execution[]> {
  const planned = cases.flatMap((c) => usersOf(c).map((user) => ({ goldenCase: c, user })));
  const executions: Execution[] = [];

  for (const [index, { goldenCase, user }] of planned.entries()) {
    const execution = await runOne(goldenCase, user, ask, options.retry ?? NO_RETRY);
    if (execution.response && !execution.response.diagnostics && options.requireDiagnostics) {
      throw new MissingDiagnosticsError();
    }
    if (options.judge && execution.response && !execution.response.refused) {
      execution.judge = await options.judge({
        question: goldenCase.question,
        answer: execution.response.text,
        quotes: execution.response.citations.map((c) => c.quote),
      });
    }
    executions.push(execution);
    options.onExecution?.(execution, index + 1, planned.length);
  }
  return executions;
}

const THROTTLED = new Set([429, 503]);

async function runOne(
  goldenCase: GoldenCase,
  user: EvalUser,
  ask: AskClient,
  retry: RetryPolicy,
): Promise<Execution> {
  let attempts = 1;
  const base = () => ({ caseId: goldenCase.id, user, attempts });
  try {
    const { result: outcome, attempts: made } = await withRetry(
      retry,
      () => ask(user, goldenCase.question),
      (result) => THROTTLED.has(result.status),
    );
    attempts = made;
    if (outcome.status !== 200) {
      return {
        ...base(),
        status: "error",
        httpStatus: outcome.status,
        latencyMs: outcome.latencyMs,
      };
    }
    return {
      ...base(),
      status: "ok",
      httpStatus: 200,
      response: outcome.body as AskResponse,
      latencyMs: outcome.latencyMs,
    };
  } catch {
    return { ...base(), status: "error", latencyMs: 0 };
  }
}
