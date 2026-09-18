import { describe, expect, it } from "vitest";
import type { AskOutcome } from "./clients.js";
import type { GoldenCase } from "./golden-set.js";
import { runEvaluation } from "./run.js";

const goldenCase: GoldenCase = {
  id: "ans-01",
  category: "answerable",
  question: "Qual o auxílio?",
  askAs: "B",
  expectedDocuments: ["politica-home-office"],
  expectedFacts: [],
  mustNotCite: [],
};
const answer = {
  text: "R$ 150,00.",
  citations: [],
  refused: false,
  promptVersion: "v1",
  piiMasked: false,
};

function scripted(statuses: number[]) {
  const calls: number[] = [];
  const ask = (): Promise<AskOutcome> => {
    const status = statuses.shift() ?? 200;
    calls.push(status);
    return Promise.resolve({ status, body: status === 200 ? answer : {}, latencyMs: 10 });
  };
  return { ask, calls };
}

describe("runEvaluation retries", () => {
  it("retries throttled calls (429/503) with growing waits and records the attempts", async () => {
    const waits: number[] = [];
    const { ask, calls } = scripted([503, 429, 200]);
    const [execution] = await runEvaluation([goldenCase], ask, {
      retry: { attempts: 4, delayMs: 1000, sleep: (ms) => Promise.resolve(void waits.push(ms)) },
    });

    expect(calls).toEqual([503, 429, 200]);
    expect(waits).toEqual([1000, 2000]);
    expect(execution).toMatchObject({ status: "ok", attempts: 3 });
  });

  it("gives up after the configured attempts", async () => {
    const { ask, calls } = scripted([503, 503, 503, 200]);
    const [execution] = await runEvaluation([goldenCase], ask, {
      retry: { attempts: 3, delayMs: 1, sleep: () => Promise.resolve() },
    });
    expect(calls).toHaveLength(3);
    expect(execution).toMatchObject({ status: "error", httpStatus: 503, attempts: 3 });
  });

  it("does not retry other failures", async () => {
    const { ask, calls } = scripted([500]);
    const [execution] = await runEvaluation([goldenCase], ask, {
      retry: { attempts: 3, delayMs: 1, sleep: () => Promise.resolve() },
    });
    expect(calls).toEqual([500]);
    expect(execution).toMatchObject({ status: "error", httpStatus: 500, attempts: 1 });
  });
});
