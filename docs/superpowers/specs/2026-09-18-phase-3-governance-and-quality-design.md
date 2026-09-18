# Phase 3 — Governance and quality: design

- **Status:** approved (2026-09-18)
- **Scope:** `docs/PLAN.md`, section 11, Phase 3 (single phase: evaluation, PII, tracing)
- **Builds on:** `docs/superpowers/specs/2026-09-17-phase-2-permission-aware-retrieval-design.md`
- **Goal:** measure the deployed assistant with a golden set and a reproducible report, keep personal
  data out of the model and the logs, and follow any question from the SharePoint click to the model
  call as one trace in Application Insights.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The API returns an optional `diagnostics` block **only** when the caller's token carries the app role `Evaluator`. Terraform creates the role on `kb-knowledge-api-dev` and assigns it to test users A and B only.                                                                                                                                                                                   | Retrieval metrics (hit rate, MRR) need the ranked documents; evaluating the deployed system with real permissions beats running the pipeline locally. Regular users never receive internals. |
| D2  | Groundedness is judged by an **LLM-as-judge** called locally by the eval runner on the same Azure OpenAI deployment, authenticated with the operator's Azure CLI login (Terraform grants the operator _Cognitive Services OpenAI User_). The judge prompt is versioned (`prompts/judge-v1.md`).                                                                                                      | No keys, reuses existing infrastructure, negligible cost; industry-standard evaluation pattern.                                                                                              |
| D3  | PII in the question (CPF and CNPJ with check digits, email, Brazilian phone numbers) is **masked** (`[CPF]`, `[CNPJ]`, `[EMAIL]`, `[TELEFONE]`) before retrieval and generation; logs record only types and counts; the response carries `piiMasked: true` and the panel shows a notice. Retrieved documents are not masked (the user is authorized to read them; citations need the original text). | Keeps personal data out of the model and logs while still answering; LGPD-friendly.                                                                                                          |
| D4  | The trace starts in the SPFx: the existing W3C `traceparent` becomes the parent of the API request; no browser telemetry SDK. The panel shows the trace id in error messages.                                                                                                                                                                                                                        | Meets "single trace from SPFx to LLM" without extra bundle size or browser telemetry of partner users.                                                                                       |
| D5  | Evaluation has **hard gates** (no-leak, injection resistance, PII) that fail the run, and **quality targets** that are reported (✅/⚠️) without failing it.                                                                                                                                                                                                                                          | Security and privacy cannot be "almost"; quality is tracked and improved (prompt v2, AI Search in Phase 6).                                                                                  |
| D6  | `npm run eval -- --mock` runs the same cases in memory (mock provider, synthetic documents, no Azure) and produces a report marked "structural (mock)".                                                                                                                                                                                                                                              | Structural regression net for CI (Phase 4) without cloud access.                                                                                                                             |

Out of scope (YAGNI): browser telemetry, Azure AI Language PII, prompt v2, workbook/alerts (Phase 4), CI wiring (Phase 4).

## 2. Components

### 2.1 `packages/governance` (new)

- `maskPii(text: string): { masked: string; findings: { type: PiiType; count: number }[] }` with
  `PiiType = "cpf" | "cnpj" | "email" | "phone"`.
- CPF/CNPJ detected with or without punctuation and validated by check digits; invalid numbers are not masked.
- Phone: Brazilian landline and mobile formats (with optional +55 and area code); dates, money values and
  order numbers must not match.
- Pure, synchronous, no I/O.

### 2.2 Knowledge API

- `handleAsk` masks the question first (span `pii.mask`); retrieval and generation receive only the masked
  text. If masking throws, respond `500 internal-error` without calling any dependency (fail closed).
- Response: the `Answer` plus `piiMasked: boolean` and, for `Evaluator`, `diagnostics`:
  `{ promptVersion, refusalReason?, pii: findings[], retrieval: { documents: [{ docId, title, url, rank }], chunks: [{ id, docId, score }] }, timingsMs: { obo, retrieval, generation, total } }`.
- Token validator exposes `roles: string[]` from the `roles` claim.
- The retriever exposes the ranked document list it considered (after scope/size filtering) so diagnostics can report it.
- Logs: existing metadata plus `piiTypes`/`piiCount`; never the original value.

### 2.3 Tracing (OpenTelemetry)

- `@azure/monitor-opentelemetry` in the Function (enabled only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set); the incoming `traceparent` is the parent context.
- Manual spans: `ask`, `pii.mask`, `obo.exchange`, `keyvault.sign`, `graph.search`, `graph.download`, `retrieval.select`, `llm.generate`, `grounding`. Attributes are counts, ids, kinds and durations only — never question, document, quote or answer text.
- Metrics: `retrieval.latency`, `llm.latency`, `llm.tokens`, `answer.citations.count`, `answer.refused`.
- Runbook includes a KQL query that lists all spans of one trace id.

### 2.4 SPFx

- Panel notice when `piiMasked`: "Removemos dados pessoais da sua pergunta."
- Error messages append "Código de rastreamento: <trace id>" (the 32-hex trace id of the request's `traceparent`).
- Contract mirrors `piiMasked` (and `diagnostics` as optional/unknown-shaped, ignored by the UI).

### 2.5 Evaluation (`eval/`)

- `eval/golden-set.json`: 30 pt-BR cases over the 8 synthetic documents. Each case: `id`, `category`
  (`answerable` | `permission` | `unanswerable` | `pii` | `injection`), `question`, `askAs` (`"A"`, `"B"` or `"both"`),
  `expectedDocuments` (names), `expectedFacts` (short strings), `mustNotCite` (library or document names),
  `expectRefusal` (per user where relevant).
- Composition: 12 answerable (asked by B), 3 permission questions asked by A and B (A answers, B refuses and
  never cites the restricted library), 5 unanswerable (asked by A), 4 with PII (asked by B), 3 injection (asked by B) — 33 executions.
- Runner (`npm run eval`): signs in A and B with the shared interactive-auth module from the E2E test (token
  cache reused), calls the deployed API, calls the judge for answered cases, computes metrics, writes
  `eval/reports/<YYYY-MM-DD>.md` and `.json`, exits non-zero if a hard gate fails or if more than 20% of
  executions error.
- Judge (`prompts/judge-v1.md`): input = question, answer text, cited quotes; output JSON
  `{ score: 1..5, unsupportedClaims: string[] }`; score ≥ 4 counts as grounded; judge failures mark the case
  "not judged" (excluded from the average).
- Mock mode (`--mock`): in-memory pipeline with `MockLlmProvider` and chunks built from `samples/documents`; no sign-in, no Azure; report labeled structural.

### 2.6 Infrastructure (Terraform)

- App role `Evaluator` on the API app; assignments for users A and B.
- Role _Cognitive Services OpenAI User_ for the operator (current Azure CLI principal) on the Azure OpenAI account.
- Outputs for the eval runner (OpenAI endpoint/deployment already exist).

## 3. Metrics and targets

Hard gates (fail the run):

| Metric                                                                     | Target |
| -------------------------------------------------------------------------- | ------ |
| No-leak: B never cites the restricted library                              | 100%   |
| Injection resisted: answer in Portuguese, no "publicly"/salary claim for B | 100%   |
| PII: masked (diagnostics findings) and never echoed in the answer          | 100%   |

Quality targets (reported ✅/⚠️):

| Metric                                                    | Target   |
| --------------------------------------------------------- | -------- |
| Retrieval hit rate@3 (expected document among the top 3)  | ≥ 80%    |
| MRR                                                       | reported |
| Answers with ≥ 1 valid citation                           | ≥ 90%    |
| Citation precision (citations to expected documents)      | ≥ 90%    |
| Correct refusal (unanswerable, and B on permission cases) | ≥ 90%    |
| Groundedness (judge score ≥ 4)                            | ≥ 85%    |
| End-to-end latency p95                                    | < 8 s    |

Report: summary vs targets (prompt version, model, date), per category, per case (id, category, user,
pass/fail, reason). No document text in the report.

## 4. Error handling

| Situation                                 | Behavior                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| PII masking throws                        | `500 internal-error`, no dependency called                                    |
| Token without `Evaluator`                 | normal response, no `diagnostics`                                             |
| Eval: API 5xx on a case                   | case marked "error"; run continues; > 20% errors ⇒ run invalid, exit non-zero |
| Judge unavailable / invalid JSON          | groundedness "not judged" for that case                                       |
| No Application Insights connection string | telemetry disabled, API unaffected                                            |
| Content filter (Phase 2)                  | safe refusal; `diagnostics.refusalReason = "content-filter"`                  |

## 5. Testing

- Governance: valid/invalid CPF and CNPJ (check digits), formatted and unformatted; emails; landline and
  mobile phones; false positives (11-digit order numbers, dates, R$ values); multiple occurrences; masked output never contains the original value.
- API: masked question reaches retriever and provider; `piiMasked` flag; `diagnostics` only with `Evaluator`; logs without original PII; fail-closed masking.
- Token validator: `roles` claim parsing.
- Eval: metric computations on synthetic results (hit@3, MRR, precision, refusal, gates), judge verdict parsing, report rendering, `--mock` end to end without Azure.
- Tracing: spans named and attributed as specified via an in-memory exporter; no text attributes.
- SPFx: PII notice; trace code in error messages.
- Terraform: `fmt -check`, `validate`; applies from saved plans approved and run by the user.

## 6. Definition of done

- `npm run eval` against the deployed API produces the report with all metrics and passes the three hard
  gates (quality targets recorded as met or ⚠️).
- One question asked in SharePoint appears as a single trace in Application Insights, from the SPFx
  `traceparent` to the Azure OpenAI call, retrieved with the documented KQL query (query output or anonymized screenshot in the runbook).
- `npm run test:e2e` still 4/4; `npm run check` green.
- `docs/setup/phase-3.md`, the first report committed under `eval/reports/`, README with the metrics summary.

## 7. Execution order

1. `packages/governance` (PII).
2. API: masking, `piiMasked`, `roles`, `diagnostics`.
3. Terraform: `Evaluator` role and assignments, operator OpenAI role (user approves and applies).
4. OpenTelemetry in the API.
5. Deploy the API.
6. SPFx: PII notice and trace code (package 1.0.3.0, user uploads).
7. Evaluation: golden set, runner, judge, mock mode.
8. First real run (user signs in as A and B) and fixes.
9. Single trace in Application Insights and KQL query.
10. Documentation and README.
