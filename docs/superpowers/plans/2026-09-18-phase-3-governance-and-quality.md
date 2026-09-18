# Phase 3 — Governance and Quality Implementation Plan

> **Execution mode:** inline by the main assistant (the user asked for no subagents), task by task with
> TDD (failing test → implementation → green) and a self-review of each diff before committing. Because
> the author and the executor are the same session, tasks pin down files, interfaces and exact test
> cases; code is written during execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate the deployed assistant with a 30-case golden set and a reproducible report, mask
personal data before retrieval/generation/logs, and trace any question from the SharePoint click to the
Azure OpenAI call as one trace in Application Insights.

**Architecture:** New `packages/governance` (PII masking). `handleAsk` masks first, exposes
`piiMasked`, and returns `diagnostics` only for tokens with the `Evaluator` app role. OpenTelemetry via
`@azure/monitor-opentelemetry` with manual spans (through `@opentelemetry/api`) in the API and packages.
New `eval` workspace: golden set, runner against the deployed API (shared interactive auth with the E2E
test), local LLM-as-judge, mock mode in memory. Terraform adds the app role, its assignments and the
operator's OpenAI role.

**Tech Stack:** Node 22, TypeScript, Vitest, `@opentelemetry/api`, `@azure/monitor-opentelemetry`,
`@azure/functions-opentelemetry-instrumentation`, `@opentelemetry/sdk-trace-base` (tests), `tsx` (eval
CLI), `@azure/msal-node`, `openai`, Terraform `azuread`/`azurerm`, SPFx 1.22.

**Spec:** `docs/superpowers/specs/2026-09-18-phase-3-governance-and-quality-design.md`

## Global Constraints

- Repository content English; pt-BR only for UI strings, refusal text, golden-set questions/facts and synthetic documents.
- Commits: Conventional Commits, English, **no Co-Authored-By or AI attribution**. Push only at the end with the user's consent.
- No partner identifiers in tracked files (real values only in git-ignored tfvars/backend.hcl/api.json/e2e.config.json/eval config).
- PII placeholders (exact): `[CPF]`, `[CNPJ]`, `[EMAIL]`, `[TELEFONE]`. CPF/CNPJ masked only when check digits are valid.
- Panel notice (exact): `Removemos dados pessoais da sua pergunta.` Error suffix (exact): `Código de rastreamento: <32-hex trace id>`.
- `diagnostics` only when the validated token has role `Evaluator`.
- Span names: `ask`, `pii.mask`, `obo.exchange`, `keyvault.sign`, `graph.search`, `graph.download`, `retrieval.select`, `llm.generate`, `grounding`. Metric names: `retrieval.latency`, `llm.latency`, `llm.tokens`, `answer.citations.count`, `answer.refused`. No question/document/quote/answer text in span attributes, metrics or logs.
- Eval hard gates (exit non-zero): no-leak 100%, injection 100%, PII 100%; > 20% errored executions ⇒ invalid run (exit non-zero). Quality targets reported ✅/⚠️: hit@3 ≥ 80%, ≥ 1 valid citation ≥ 90%, citation precision ≥ 90%, correct refusal ≥ 90%, groundedness (judge ≥ 4) ≥ 85%, p95 < 8 s; MRR reported.
- Terraform applies only from saved plans approved and run by the user.

---

## File Structure

```
packages/governance/{package.json,tsconfig.json,src/pii.ts,src/pii.test.ts,src/index.ts}
packages/core/src/model.ts                        + AskResponse, Diagnostics types
apps/knowledge-api/src/auth/token-validator.ts    + roles
apps/knowledge-api/src/ask/handle-ask.ts          masking, piiMasked, diagnostics, spans, metrics
apps/knowledge-api/src/telemetry.ts               init Azure Monitor + Functions instrumentation
apps/knowledge-api/src/main.ts                    import telemetry first
apps/knowledge-api/host.json                      telemetryMode OpenTelemetry
packages/retrievers/src/graph-search-retriever.ts + documents in RetrievalResult, spans
apps/knowledge-api/src/auth/{obo,client-assertion}.ts   spans
packages/llm-providers/src/azure-openai.ts        span llm.generate
apps/spfx-assistant/src/{contract.ts,api/KnowledgeApiClient.ts,components/ChatPanel.tsx}
infra/terraform/modules/identity/{main,outputs}.tf  Evaluator role + assignments
infra/terraform/envs/dev/main.tf                   operator OpenAI role
test-support/auth/{interactive-auth.ts,config.ts}  shared sign-in (moved from e2e)
eval/{package.json,tsconfig.json,golden-set.json,eval.config.example.json}
eval/src/{types.ts,golden-set.ts,metrics.ts,judge.ts,report.ts,clients.ts,mock-pipeline.ts,cli.ts}
eval/src/*.test.ts
prompts/judge-v1.md
docs/setup/phase-3.md, README.md, docs/PLAN.md
```

### Task 1: `packages/governance` — PII masking

**Files:** create `packages/governance/*`; modify root `tsconfig.json` (reference), `vitest.config.ts` (alias `@kb/governance`).

**Interfaces — Produces:** `type PiiType = "cpf" | "cnpj" | "email" | "phone"`; `interface PiiFinding { type: PiiType; count: number }`; `function maskPii(text: string): { masked: string; findings: PiiFinding[] }` (findings sorted by type, only types with count > 0).

- [ ] Tests first (`pii.test.ts`):
  - CPF valid `529.982.247-25` and `52998224725` → `[CPF]`; invalid check digits `529.982.247-26` and `111.111.111-11` → unchanged.
  - CNPJ valid `11.222.333/0001-81` and `11222333000181` → `[CNPJ]`; invalid `11.222.333/0001-82` unchanged.
  - Email `fulano.silva@empresa.com.br` → `[EMAIL]`.
  - Phones → `[TELEFONE]`: `(11) 98765-4321`, `11 3456-7890`, `+55 11 98765-4321`, `11987654321` (valid mobile with 9), `(21) 2345-6789`.
  - Not masked: `12/05/2026`, `R$ 1.234,56`, order `Pedido 98765432101` when not a valid CPF (use an 11-digit number with invalid CPF digits), `2026`, `3 dias`.
  - Multiple occurrences counted: two emails + one CPF → findings `[{cpf,1},{email,2}]`; masked text contains no original value.
  - No PII → `{ masked: text, findings: [] }`.
- [ ] Implement with regexes + check-digit validators (CPF/CNPJ reject all-same-digit sequences); order: email → CNPJ → CPF → phone (so CNPJ digits aren't consumed as phone/CPF).
- [ ] `npx vitest run packages/governance`, `npm run check`, commit `feat(governance): add PII detection and masking for CPF, CNPJ, email and phone`.

### Task 2: API — masking, roles, `piiMasked`, `diagnostics`

**Files:** `packages/core/src/model.ts` (+ exported types), `apps/knowledge-api/src/auth/token-validator.ts`(+test), `packages/retrievers/src/graph-search-retriever.ts`(+test), `apps/knowledge-api/src/ask/handle-ask.ts`(+test), `apps/knowledge-api/package.json` (`@kb/governance`), `apps/knowledge-api/tsconfig.json` (reference), `apps/spfx-assistant/src/contract.ts`, `apps/knowledge-api/contract-check.ts`.

**Interfaces — Produces:**

- `@kb/core`: `interface RetrievedDocument { docId: string; title: string; url: string; rank: number }`; `interface Diagnostics { promptVersion: string; refusalReason?: RefusalReason; pii: { type: string; count: number }[]; retrieval: { documents: RetrievedDocument[]; chunks: { id: string; docId: string; score: number }[] }; timingsMs: { obo: number; retrieval: number; generation: number; total: number } }`; `type RefusalReason = "no-relevant-documents" | "ungrounded" | "content-filter"`; `interface AskResponse extends Answer { piiMasked: boolean; diagnostics?: Diagnostics }`.
- `TokenValidationResult` success adds `roles: string[]` (from `roles` claim; `[]` when absent/invalid).
- `RetrievalResult` adds `documents: RetrievedDocument[]`: the in-scope `.docx` documents that were downloaded and parsed, ranked 1..n in Graph search order.
- SPFx `contract.ts`: `AskResponse` gains `piiMasked: boolean` and `diagnostics?: unknown`; contract-check compares response against `Omit<AskResponse, "diagnostics"> & { diagnostics?: unknown }`.
- [ ] Tests first:
  - validator: token with `roles: ["Evaluator"]` → `roles` present; no roles → `[]`; non-array → `[]`.
  - retriever: result `documents` lists in-scope downloaded docs with rank 1..n and titles/urls.
  - handleAsk: question with a valid CPF → retriever and provider receive `[CPF]` (never the original); response `piiMasked: true`; log `ask.completed` has `piiTypes: ["cpf"]`, `piiCount: 1` and serialized logs never contain the CPF; no-PII → `piiMasked: false`, no pii log fields; `roles` without `Evaluator` → no `diagnostics`; with `Evaluator` → `diagnostics` with promptVersion, retrieval.documents/chunks, pii, refusalReason when refused, timings numbers; masking throwing (inject `maskPii` dependency that throws) → 500 and no exchange/retrieve call.
- [ ] Implement: `AskDependencies` gains `maskPii` (default from `@kb/governance` in wiring) and timings via `now()`.
- [ ] `npm run check`, commit `feat(knowledge-api): mask PII and expose evaluator diagnostics`.

### Task 3: Terraform — `Evaluator` role, assignments, operator OpenAI role

**Files:** `infra/terraform/modules/identity/main.tf` (app_role in `azuread_application.knowledge_api` with `random_uuid.evaluator_role`, `azuread_app_role_assignment` for A and B), `infra/terraform/modules/identity/outputs.tf` (`evaluator_role_id`), `infra/terraform/envs/dev/main.tf` (`data "azurerm_client_config" "current"` + `azurerm_role_assignment "operator_openai"` _Cognitive Services OpenAI User_ on `module.openai.account_id`).

- [ ] `terraform fmt -check`, `validate`, save plan `dev.tfplan`; expected: app update in place (role added), 2 app role assignments, 1 random_uuid, 1 azurerm role assignment; 0 destroy.
- [ ] Hand the plan to the user; after apply, follow-up plan `No changes`; commit `feat(infra): add Evaluator app role and operator access to Azure OpenAI`.

### Task 4: OpenTelemetry

**Files:** `apps/knowledge-api/src/telemetry.ts`, `apps/knowledge-api/src/main.ts`, `apps/knowledge-api/host.json` (`"telemetryMode": "OpenTelemetry"`), `apps/knowledge-api/package.json`, spans in `handle-ask.ts`, `auth/obo.ts`, `auth/client-assertion.ts`, `packages/retrievers/src/graph-search-retriever.ts`, `packages/llm-providers/src/azure-openai.ts` (each package depends on `@opentelemetry/api`), metrics in `handle-ask.ts`.

**Interfaces — Produces:** `initTelemetry(env)` (no-op without `APPLICATIONINSIGHTS_CONNECTION_STRING`); helper `withSpan<T>(name: string, attributes: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T>` in `@kb/core` (`packages/core/src/tracing.ts`) using `@opentelemetry/api`, recording exceptions (name only) and setting status.

- [ ] Tests first (a test helper registers `BasicTracerProvider` + `InMemorySpanExporter`):
  - `handleAsk` with fake deps creates `ask` (root), `pii.mask` and `grounding`, all sharing one trace id; no attribute value contains the question or chunk text.
  - `createOboExchanger` creates `obo.exchange`; `createClientAssertion` creates `keyvault.sign`.
  - `GraphSearchRetriever` creates `graph.search`, one `graph.download` per downloaded document, and `retrieval.select`.
  - `AzureOpenAiProvider.generate` creates `llm.generate` with token counts as attributes.
  - Span ownership: `ask`/`pii.mask`/`grounding` in handleAsk; `obo.exchange`/`keyvault.sign` in auth; `graph.*`/`retrieval.select` in retrievers; `llm.generate` in llm-providers.
- [ ] Metrics recorded through `metrics.getMeter("knowledge-api")` (histograms `retrieval.latency`, `llm.latency`; counters `llm.tokens`, `answer.citations.count`, `answer.refused`) — unit test with a `MeterProvider` + in-memory metric reader asserting names exist after a call.
- [ ] `npm run package -w @kb/knowledge-api` still bundles; `npm run check`; commit `feat(knowledge-api): add OpenTelemetry tracing and metrics`.

### Task 5: Deploy and smoke

- [ ] Package + `func azure functionapp publish`; `curl` 401 smoke; one real question via `npm run test:e2e` (user) to confirm no regression.
- [ ] Commit runbook skeleton `docs/setup/phase-3.md` (`docs: start Phase 3 runbook`).

### Task 6: SPFx — PII notice and trace code (package 1.0.3.0)

**Files:** `apps/spfx-assistant/src/api/KnowledgeApiClient.ts` (`AskResult` error branch adds `traceId: string`; success carries `answer` with `piiMasked`), `src/components/ChatPanel.tsx`, tests, `config/package-solution.json` (1.0.3.0).

- [ ] Tests first: error results include the trace id from the generated traceparent (32 hex); ChatPanel error message text ends with `Código de rastreamento: <id>`; answer with `piiMasked: true` shows `Removemos dados pessoais da sua pergunta.`; without it no notice.
- [ ] Build `.sppkg`; `npm run check`; commit `feat(spfx): show PII notice and trace code`; user uploads 1.0.3.0.

### Task 7: Evaluation workspace

**Files:** `test-support/auth/*` (move `signIn` + config loader out of `apps/knowledge-api/e2e`, update e2e imports), `eval/*`, `prompts/judge-v1.md`, root `package.json` (workspace `eval`, scripts `eval`, `eval:mock`), `.gitignore` (`eval/eval.config.json`, keep reports tracked), `vitest.config.ts` include `eval/**/*.test.ts`.

**Interfaces — Produces:**

- `GoldenCase { id; category: "answerable"|"permission"|"unanswerable"|"pii"|"injection"; question; askAs: "A"|"B"|"both"; expectedDocuments: string[]; expectedFacts: string[]; mustNotCite: string[]; expectRefusal?: { A?: boolean; B?: boolean } }`.
- `Execution { caseId; user: "A"|"B"; status: "ok"|"error"; httpStatus?; response?: AskResponse; latencyMs; judge?: { score: number; unsupportedClaims: string[] } | "not-judged" }`.
- `computeMetrics(cases, executions): Metrics` (hitAt3, mrr, withCitation, citationPrecision, correctRefusal, groundedness, p95LatencyMs, gates { noLeak, injection, pii }, errorRate, perCategory, perCase results with reasons).
- `renderReport(metrics, meta): { markdown: string; json: string }`.
- `AskClient = (user: "A"|"B", question: string) => Promise<{ status: number; body: unknown; latencyMs: number }>`; `createApiClient(config, tokens)`, `createMockClient()` (in-process `handleAsk` with `MockLlmProvider`, fake retriever over `samples/documents` parsed by `@kb/sample-docs` parser, B without `RH-Restrito`, both with role `Evaluator`).
- Judge: `judgeAnswer(chat, { question, answer, quotes }) → { score, unsupportedClaims } | "not-judged"` using `prompts/judge-v1.md` and the `ChatClient` from `@kb/llm-providers` created with `AzureCliCredential`.
- [ ] Golden set: 30 cases per spec composition (12 answerable asked by B; 3 permission asked by both; 5 unanswerable by A; 4 PII by B; 3 injection by B) with expected documents/facts taken from `samples/documents`.
- [ ] Tests first: metrics on hand-built executions (hit@3 rank 1/2/4, MRR values, citation precision, refusals, each gate failing independently, error-rate invalidation); judge parsing (valid JSON, score out of range → not-judged, invalid JSON → not-judged); report contains summary table, ✅/⚠️ markers, no document text; golden set schema validation (30 cases, ids unique, counts per category); mock end-to-end run produces a report with gates passing.
- [ ] CLI: `npm run eval` (real) and `npm run eval -- --mock`; writes `eval/reports/<YYYY-MM-DD>[-mock].{md,json}`; exit codes per constraints.
- [ ] `npm run check`, commit `feat(eval): add golden set, evaluation runner, judge and mock mode`.

### Task 8: First real evaluation run

- [ ] User fills `eval/eval.config.json` (same fields as e2e + judge endpoint/deployment) or runner reuses e2e config; user runs `npm run eval` (sign-ins cached).
- [ ] Analyze results; fix defects found (with tests) — never weaken gates or golden-set expectations to pass; quality targets below goal are recorded, not hidden.
- [ ] Commit the first report `eval/reports/<date>.{md,json}` (`docs(eval): add first evaluation report`).

### Task 9: Single trace in Application Insights

- [ ] User asks a question in SharePoint (and triggers an error or reads the correlation id); query Log Analytics (`AppRequests`/`AppDependencies`/`AppTraces` by `OperationId`) via `az rest` for the trace id; confirm spans from request through `llm.generate`.
- [ ] Document the KQL and the observed span tree (no identifiers) in `docs/setup/phase-3.md`.

### Task 10: Documentation

- [ ] Complete `docs/setup/phase-3.md` (PII, Evaluator role, telemetry, eval usage, KQL, pitfalls); README current phase and metrics summary; PLAN Phase 3 notes; `npm run check`; identifier check; commit `docs: complete Phase 3 runbook and README`.
