# Phase 3 — Governance and quality: runbook

Definition of done: see the spec (`docs/superpowers/specs/2026-09-18-phase-3-governance-and-quality-design.md`).

## Checklist

| #   | Item                                                          | Where      | Status |
| --- | ------------------------------------------------------------- | ---------- | ------ |
| 1   | PII masking before retrieval and generation                   | API        | ✅     |
| 2   | `Evaluator` app role assigned to A and B; operator OpenAI use | Terraform  | ✅     |
| 3   | OpenTelemetry spans and metrics exported to App Insights      | Azure      | ✅     |
| 4   | SPFx 1.0.3.0 with PII notice and trace code uploaded          | SharePoint | ⏳     |
| 5   | Golden set, evaluation runner, judge and mock mode            | Local      | ⏳     |
| 6   | First real evaluation report committed                        | Local      | ⏳     |
| 7   | One question followed end to end as a single trace (KQL)      | Azure      | ⏳     |

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

## Pitfalls

- `import.meta.url` is undefined in the CommonJS bundle; see "Deploy the API".
