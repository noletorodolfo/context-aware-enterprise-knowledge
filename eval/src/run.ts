import type { AskResponse } from "@kb/core";
import type { AskClient } from "./clients.js";
import { usersOf, type EvalUser, type GoldenCase } from "./golden-set.js";
import type { Judge } from "./judge.js";
import type { Execution } from "./metrics.js";

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
    const execution = await runOne(goldenCase, user, ask);
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

async function runOne(goldenCase: GoldenCase, user: EvalUser, ask: AskClient): Promise<Execution> {
  const base = { caseId: goldenCase.id, user };
  try {
    const outcome = await ask(user, goldenCase.question);
    if (outcome.status !== 200) {
      return { ...base, status: "error", httpStatus: outcome.status, latencyMs: outcome.latencyMs };
    }
    return {
      ...base,
      status: "ok",
      httpStatus: 200,
      response: outcome.body as AskResponse,
      latencyMs: outcome.latencyMs,
    };
  } catch {
    return { ...base, status: "error", latencyMs: 0 };
  }
}
