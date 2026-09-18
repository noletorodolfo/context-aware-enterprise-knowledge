# Phase 3 — Governance and quality: runbook

Definition of done: see the spec (`docs/superpowers/specs/2026-09-18-phase-3-governance-and-quality-design.md`).

## Checklist

| #   | Item                                                          | Where      | Status |
| --- | ------------------------------------------------------------- | ---------- | ------ |
| 1   | PII masking before retrieval and generation                   | API        | ✅     |
| 2   | `Evaluator` app role assigned to A and B; operator OpenAI use | Terraform  | ✅     |
| 3   | OpenTelemetry spans and metrics exported to App Insights      | Azure      | ✅     |
| 4   | SPFx 1.0.3.0 with PII notice and trace code uploaded          | SharePoint | ✅     |
| 5   | Golden set, evaluation runner, judge and mock mode            | Local      | ✅     |
| 6   | First real evaluation report committed                        | Local      | ✅     |
| 7   | One question followed end to end as a single trace (KQL)      | Azure      | ✅     |

## Provision

Terraform binary used on Windows:

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
```

Phase 3 adds, on top of the Phase 2 resources:

- the `Evaluator` app role on the Knowledge API registration, assigned to test
  users A and B. Only tokens carrying this role receive the `diagnostics` block
  from `/api/ask`;
- a _Cognitive Services OpenAI User_ assignment for the operator running
  Terraform, so the evaluation judge can call Azure OpenAI with `az login`
  (no keys).

```powershell
& $tf "-chdir=infra/terraform/envs/dev" plan "-out=dev.tfplan"
& $tf "-chdir=infra/terraform/envs/dev" apply dev.tfplan
```

Result: 4 added, 1 changed, 0 destroyed; a follow-up plan shows no changes.

## Deploy the API

The package script bundles `src/main.ts` into `deploy/main.cjs`. It now
also maps `import.meta.url` to the bundle file, because
`@azure/monitor-opentelemetry` ships ESM code that reads it and would
otherwise fail inside a CommonJS bundle.

```powershell
npm run package -w @kb/knowledge-api
$name = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
Push-Location apps/knowledge-api/deploy
& "C:\Program Files\Microsoft\Azure Functions Core Tools\func.exe" azure functionapp publish $name
Pop-Location
```

"The app appears to be unhealthy" at the end of the publish output is
expected: the host has no HTTP health endpoint.

Smoke test: `POST /api/ask` without a token returns `401` with an
`x-correlation-id` header.

## Telemetry

- `host.json` sets `"telemetryMode": "OpenTelemetry"`. `src/register-telemetry.ts`
  is imported first by `src/main.ts` and calls `initTelemetry(process.env)`.
  This registers Azure Monitor OpenTelemetry and the Azure Functions
  instrumentation only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set,
  which Terraform does through the Function App `site_config`.
- Spans: `ask` → `pii.mask`, `obo.exchange` → `keyvault.sign`,
  `graph.search`, `graph.download` (one per document), `retrieval.select`,
  `llm.generate`, `grounding`.
- Metrics (meter `knowledge-api`): `retrieval.latency`, `llm.latency`,
  `llm.tokens`, `answer.citations.count`, `answer.refused`.
- Attributes and metrics hold counts, statuses, versions and error kinds only.
  Question, document, quote and answer text never leave the request. Tests
  enforce this.

## SPFx 1.0.3.0

- Error messages end with `Código de rastreamento: <trace id>`. The id is the
  trace id of the W3C `traceparent` the panel sends with the request, so
  support can find the request in Application Insights (see "Follow one
  question as a single trace").
- When the question had personal data masked (`piiMasked: true`), the answer
  shows "Removemos dados pessoais da sua pergunta."

Upload `apps/spfx-assistant/sharepoint/solution/spfx-assistant.sppkg` to the
App Catalog, replacing 1.0.2.0, then update the app on the demo site.

## Evaluation

### Configuration

The runner reuses the end-to-end configuration and token caches
(`apps/knowledge-api/e2e/`), so A and B do not sign in again. The judge
settings live in the git-ignored `eval/eval.config.json` (see
`eval/eval.config.example.json`). The endpoint and deployment come from the
Terraform outputs:

```powershell
& $tf "-chdir=infra/terraform/envs/dev" output -raw openai_endpoint
& $tf "-chdir=infra/terraform/envs/dev" output -raw openai_deployment
```

The judge authenticates with the operator's `az login` (`AzureCliCredential`),
which holds _Cognitive Services OpenAI User_ on the Azure OpenAI account.

### Running

```bash
npm run eval        # real run against the deployed API (A and B, judge on)
npm run eval:mock   # structural run in process: mock model, synthetic documents, no Azure
```

Reports go to `eval/reports/<YYYY-MM-DD>.{md,json}`. Mock reports are
git-ignored; real reports are committed. Exit code 0 means a valid run with
every hard gate passing, 1 means a gate failed or more than 20% of the
executions errored, and 2 means the run could not start (configuration or
sign-in).

If the API answers without `diagnostics`, the cached token predates the
`Evaluator` role assignment. Delete `apps/knowledge-api/e2e/.token-cache-*.json`
and sign in again.

### Golden set

`eval/golden-set.json` holds 30 pt-BR cases (33 executions):

| Category     | Cases | Asked by | Checks                                                     |
| ------------ | ----- | -------- | ---------------------------------------------------------- |
| answerable   | 15    | B        | expected document in the top 3, citation, facts, judge     |
| permission   | 3     | A and B  | A answers from the HR library; B refuses and never sees it |
| unanswerable | 5     | A        | refusal                                                    |
| pii          | 4     | B        | CPF, email, phone and CNPJ masked, never echoed            |
| injection    | 3     | B        | the planted instruction in the supplier FAQ is ignored     |

The spec lists 12 answerable cases, but its own totals (30 cases, 33
executions) need 15, so the golden set follows the totals.

### First report (2026-09-18)

Prompt v1 on gpt-4.1-mini, judge v1. All three hard gates passed and every
quality target was met:

| Metric                          | Result       | Target   |
| ------------------------------- | ------------ | -------- |
| Retrieval hit rate@3            | 100% (25/25) | ≥ 80%    |
| MRR                             | 0.96         | reported |
| Answers with ≥ 1 valid citation | 100% (25/25) | ≥ 90%    |
| Citation precision              | 100% (26/26) | ≥ 90%    |
| Correct refusal                 | 100% (8/8)   | ≥ 90%    |
| Groundedness (judge ≥ 4)        | 100% (25/25) | ≥ 85%    |
| End-to-end latency p95          | 4.8 s        | < 8 s    |

The golden set holds only 8 documents, so these numbers are a regression
baseline and do not predict quality on a real corpus.

### Defects found by the evaluation

- **CPF/CNPJ before punctuation were not masked.** In
  `Meu CPF é 529.982.247-25.`, the trailing period blocked the CPF pattern,
  so the number reached retrieval and the model. Fixed in
  `packages/governance` (a separator only blocks a match when a digit follows
  it), with tests, before the first real run.
- **Throttling.** The first real run got Azure OpenAI 429s on 15 of 33
  executions: the deployment's 10K tokens/minute are shared by the API and
  the judge. The runner now retries 429/503 with 15/30/45 s waits and reports
  the extra calls (5 in the committed report). Real users hitting the same
  limit see "Assistente indisponível"; raising the deployment capacity does
  not change the price per token.

## Follow one question as a single trace

The SPFx panel sends a `traceparent` header. The Functions host continues that
trace, and the Azure Functions instrumentation makes it active in the
invocation, so every manual span shares the trace id generated in the
browser. That trace id is the App Insights `OperationId`.

Queries run through the Log Analytics REST API, which needs no CLI extension:

```powershell
$ws  = az resource list --resource-type Microsoft.OperationalInsights/workspaces --query "[0].id" -o tsv
$cid = az resource show --ids $ws --query properties.customerId -o tsv
az rest --method post --url "https://api.loganalytics.io/v1/workspaces/$cid/query" `
  --resource "https://api.loganalytics.io" --body "@query.json"
```

`query.json` holds `{ "query": "<KQL>" }`. To follow a trace code shown in the
panel:

```kusto
let op = "<trace id>";
union
  (AppRequests     | where OperationId == op | project TimeGenerated, Type, Name, Id, ParentId, DurationMs, ResultCode),
  (AppDependencies | where OperationId == op | project TimeGenerated, Type, Name, Id, ParentId, DurationMs, Properties)
| order by TimeGenerated asc
```

Observed tree for one answered question (durations in ms):

```text
POST api/ask (request, 200)           3369
└─ ask                                3364   kb.refused=false, kb.citations.count=1
   ├─ pii.mask                           0   kb.pii.count=0
   ├─ obo.exchange                       0   kb.obo.cache_hit=true (keyvault.sign only on a miss)
   ├─ graph.search                     432   kb.search.hits=3, kb.documents.count=3
   ├─ graph.download ×3            169–194   kb.sections.count=4..5
   ├─ retrieval.select                   0   kb.candidates.count=13, kb.chunks.count=6
   ├─ llm.generate                    2395   gen_ai.usage.input_tokens=746, output_tokens=105
   └─ grounding                          0   kb.citations.count=1
```

A request sent with an explicit `traceparent` (trace id
`81a2edff16605958a5b3e80c88cd91da`, no token) showed up under exactly that
`OperationId`. This is the same header the panel sends.

To find why requests failed:

```kusto
AppTraces
| where Message has "ask.upstream-failed"
| extend d = parse_json(Message)
| summarize n = count() by errKind = tostring(d["kind"]), httpStatus = tostring(d.status), errCode = tostring(d.code)
```

`kind` is a reserved word in KQL, so it is read with `d["kind"]`.

## Pitfalls

- `import.meta.url` is undefined in the CommonJS bundle; see "Deploy the API".
- Running Prettier over `apps/spfx-assistant/src` also reformats scaffolded
  files (`loc/*.js`, `myStrings.d.ts`). Revert them to keep the diff focused.
- Tokens cached before an app role assignment do not carry the role; see
  "Evaluation".
- Markdown reports are excluded from Prettier (`.prettierignore`), because the
  generated tables are not aligned the way Prettier aligns them.
