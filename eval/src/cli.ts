import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AzureCliCredential } from "@azure/identity";
import { createAzureOpenAiChatClient } from "@kb/llm-providers";
import { signIn } from "@kb/test-support/auth";
import { loadE2eConfig, tokenCacheFile } from "@kb/test-support/e2e-config";
import { createApiClient, type AskClient } from "./clients.js";
import { loadGoldenSet } from "./golden-set.js";
import { createJudge, JUDGE_PROMPT_VERSION, type Judge } from "./judge.js";
import { computeMetrics } from "./metrics.js";
import { createMockClient } from "./mock-client.js";
import { renderReport, runPassed } from "./report.js";
import { runEvaluation } from "./run.js";

interface EvalConfig {
  judge: { endpoint: string; deployment: string };
}

const root = new URL("../../", import.meta.url);
const evalDir = new URL("eval/", root);

function loadEvalConfig(): EvalConfig {
  let config: Partial<EvalConfig>;
  try {
    config = JSON.parse(
      readFileSync(new URL("eval.config.json", evalDir), "utf8"),
    ) as Partial<EvalConfig>;
  } catch {
    throw new Error(
      "Missing eval/eval.config.json. Copy eval.config.example.json and fill in the judge endpoint and deployment.",
    );
  }
  if (!config.judge?.endpoint || !config.judge.deployment) {
    throw new Error('eval.config.json: "judge.endpoint" and "judge.deployment" are required.');
  }
  return config as EvalConfig;
}

function localDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function main(): Promise<void> {
  const mock = process.argv.includes("--mock");
  const cases = loadGoldenSet(new URL("golden-set.json", evalDir));

  let ask: AskClient;
  let judge: Judge | undefined;
  let model = "mock";
  if (mock) {
    ask = createMockClient(new URL("samples/documents/", root));
  } else {
    const config = loadE2eConfig();
    const evalConfig = loadEvalConfig();
    console.log("Signing in test users A and B (cached tokens are reused)...");
    const tokens = {
      A: await signIn(config, config.userA, tokenCacheFile("a")),
      B: await signIn(config, config.userB, tokenCacheFile("b")),
    };
    ask = createApiClient(config, tokens);
    judge = createJudge(
      createAzureOpenAiChatClient({
        endpoint: evalConfig.judge.endpoint,
        deployment: evalConfig.judge.deployment,
        credential: new AzureCliCredential(),
      }),
      readFileSync(new URL("prompts/judge-v1.md", root), "utf8"),
    );
    model = evalConfig.judge.deployment;
  }

  const executions = await runEvaluation(cases, ask, {
    ...(judge ? { judge } : {}),
    requireDiagnostics: !mock,
    onExecution: (e, index, total) =>
      console.log(
        `[${index}/${total}] ${e.caseId}/${e.user} ${e.status === "ok" ? "ok" : `error ${e.httpStatus ?? ""}`} ${Math.round(e.latencyMs)} ms`,
      ),
  });

  const metrics = computeMetrics(cases, executions);
  const date = localDate();
  const { markdown, json } = renderReport(metrics, {
    date,
    mode: mock ? "mock" : "real",
    promptVersion: executions.find((e) => e.response)?.response?.promptVersion ?? "unknown",
    model,
    judge: judge ? JUDGE_PROMPT_VERSION : "none",
    cases: cases.length,
  });

  const reports = new URL("reports/", evalDir);
  mkdirSync(reports, { recursive: true });
  const base = `${date}${mock ? "-mock" : ""}`;
  writeFileSync(new URL(`${base}.md`, reports), markdown);
  writeFileSync(new URL(`${base}.json`, reports), json);

  const passed = runPassed(metrics);
  console.log(`\nReport: ${fileURLToPath(new URL(`${base}.md`, reports))}`);
  console.log(passed ? "Evaluation passed (all hard gates, valid run)." : "Evaluation FAILED.");
  process.exitCode = passed ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
