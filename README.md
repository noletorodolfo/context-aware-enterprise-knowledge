# Context-Aware Enterprise Knowledge Platform

[![ci](https://github.com/noletorodolfo/context-aware-enterprise-knowledge/actions/workflows/ci.yml/badge.svg)](https://github.com/noletorodolfo/context-aware-enterprise-knowledge/actions/workflows/ci.yml)

> A SharePoint knowledge assistant that answers from documents the current user can already open,
> cites its sources, masks common Brazilian personal data and exposes evidence for every quality claim.

![An anonymized SharePoint search result showing that a restricted salary document is not visible to the restricted test user.](docs/images/tabelasalarial_kb_denied.png)

This is a public portfolio project built around a real integration boundary and a synthetic document
corpus. It demonstrates how to put a governed retrieval-augmented assistant inside SharePoint without
turning document permissions, prompts, observability or delivery into afterthoughts.

## What it proves

- **Permission-aware answers.** The API exchanges the user's token on behalf of that user and calls
  Microsoft Graph Search with a delegated token. A document that SharePoint hides remains unavailable
  to the assistant.
- **Citations that are checked.** Model output is schema-validated and every citation must match a
  retrieved excerpt before it reaches the panel.
- **Governed input and output.** CPF, CNPJ, email addresses and Brazilian phone numbers are masked
  before retrieval and generation. Retrieved text is treated as untrusted data, so an instruction
  planted in a document is ignored; a content-filter block becomes a safe refusal.
- **Evidence instead of a demo-only claim.** A 30-case golden set checks permission boundaries,
  PII, prompt injection, retrieval, citations and groundedness. The trace starts with the panel's
  `traceparent`, and OpenTelemetry follows it through the API, Graph and model calls.
- **Reproducible delivery.** Terraform, remote state, GitHub Actions OIDC, reviewed plans, a workbook,
  an alert and a destroy-and-recreate drill are part of the implementation.

## Result baseline

The latest committed real-environment evaluation used the shipped defaults (Graph Search retrieval and
prompt `v1`), `gpt-4.1-mini`, judge `judge-v1` and 30 Portuguese cases (33 executions). All hard gates
passed.

| Measure                        |     Result | Target |
| ------------------------------ | ---------: | -----: |
| No restricted-document leak    | 0 failures |      0 |
| Prompt-injection failures      | 0 failures |      0 |
| PII masking failures           | 0 failures |      0 |
| Retrieval hit rate@3           |     100.0% | >= 80% |
| Answers with a valid citation  |      92.0% | >= 90% |
| Citation precision             |     100.0% | >= 90% |
| Correct refusal                |     100.0% | >= 90% |
| Groundedness, judge score >= 4 |     100.0% | >= 85% |
| End-to-end latency p95         |     4.03 s |  < 8 s |

Read the [full report](eval/reports/2026-09-23-graph-v1.md). The corpus contains eight synthetic
documents; these measurements are a regression baseline, not a forecast for an enterprise-scale
intranet.

The 8% of answers without a citation are not a retrieval miss: every one of them is a safe refusal
produced by Azure's prompt shield, which blocks generation when the retrieved context includes the
document that deliberately carries an injected instruction. Reports record the refusal reason, so the
distinction is visible rather than assumed.

## Two retrievers, two prompts, one golden set

Retrieval and the prompt are selectable per request for holders of the `Evaluator` role, so both can
be measured against the same cases on the same corpus. All four runs passed every hard gate with no
errors.

| Measure                       | Graph / v1 | AI Search / v1 | Graph / v2 | AI Search / v2 |
| ----------------------------- | ---------: | -------------: | ---------: | -------------: |
| Retrieval hit rate@3          |     100.0% |         100.0% |     100.0% |         100.0% |
| MRR                           |      0.980 |          1.000 |      0.980 |          1.000 |
| Answers with a valid citation |      92.0% |          92.0% |      92.0% |          92.0% |
| Correct refusal               |     100.0% |         100.0% |     100.0% |         100.0% |
| Groundedness                  |     100.0% |         100.0% |     100.0% |         100.0% |
| End-to-end latency p95        |     4.03 s |         3.10 s |     3.84 s |         4.24 s |

Both conclusions are negative, and both are kept:

- **Prompt v2 changed nothing.** It tells the model to answer when an excerpt answers the question
  even if the wording differs. No case result and no metric moved, under either retriever, so `v1`
  remains the default and v2 stays in the repository as the measurement that justified not shipping it
  ([ADR-013](docs/adr/013-prompt-versioning.md)).
- **Hybrid retrieval ranks marginally better and is still not the default.** MRR 1.000 against 0.980,
  everything else equal. That does not pay for a retriever whose copy of the permissions is only as
  fresh as its last indexing run, while indexing is still a manual step. It stays selectable and
  becomes the candidate default after Phase 7 ([ADR-012](docs/adr/012-hybrid-ai-search-retriever.md)).

Per-variant reports and the three side-by-side comparisons are in [eval/reports/](eval/reports/); the
[Phase 6 runbook](docs/setup/phase-6.md) explains what only the real corpus revealed.

## Architecture at a glance

```mermaid
flowchart LR
    User[SharePoint user] --> Panel[SPFx assistant]
    Panel -->|Entra token + traceparent| API[Knowledge API<br/>Azure Functions]
    API -->|OBO delegated token| Graph[Microsoft Graph Search]
    API -->|managed identity| Model[Azure OpenAI]
    API --> KV[Key Vault signing key]
    API -. OpenTelemetry .-> Monitor[Application Insights]
    Graph --> Docs[SharePoint documents<br/>permission trimmed]
    Model --> API
    API -->|answer + citations| Panel
```

The detailed design, boundaries and quality trade-offs are in
[architecture.md](docs/architecture.md). The [security model](docs/security.md) explains the controls
and residual risks; [ADRs](docs/adr/) record the decisions.

## Demonstration

**[Watch the two-minute demo](https://github.com/noletorodolfo/context-aware-enterprise-knowledge/releases/latest/download/context-aware-enterprise-knowledge-demo.mp4)** (MP4, 10 MB, no narration of live data).

The recording script is deliberately short and repeatable:

1. Ask a public policy question and open its source citation.
2. Ask the same restricted question as two users; one receives a cited answer and the other a safe refusal.
3. Show the golden-set report and a single distributed trace.
4. Show the green delivery pipeline and a value-free Terraform plan summary.

The [Phase 5 runbook](docs/setup/phase-5.md) contains the script and the media-redaction checklist,
including what the frame-by-frame review of this recording found and how it was fixed. The published
video uses synthetic documents and redacted browser frames only.

## Documentation map

| Document                                         | Purpose                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| [Architecture](docs/architecture.md)             | Context, containers, request flow, tenant boundary and operational qualities |
| [Security](docs/security.md)                     | Threat model, controls, privacy boundary and residual risk                   |
| [Runbook](docs/runbook.md)                       | Configure, deploy, verify, recover and observe the system                    |
| [Certification evidence](docs/certifications.md) | Direct links from competency claims to repository evidence                   |
| [ADRs](docs/adr/)                                | The key implementation decisions                                             |
| [Project plan](docs/PLAN.md)                     | Completed phases and future roadmap                                          |
| [Phase runbooks](docs/setup/)                    | Reproducible implementation and verification history                         |

## Repository structure

| Path                     | Content                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `apps/knowledge-api`     | Azure Functions API: validation, OBO, orchestration and telemetry      |
| `apps/spfx-assistant`    | SharePoint Framework Application Customizer and accessible React panel |
| `packages/core`          | Domain contracts, citation grounding and tracing helpers               |
| `packages/retrievers`    | Graph Search and hybrid Azure AI Search retrieval, both ACL-filtered   |
| `packages/governance`    | PII detection and masking                                              |
| `packages/llm-providers` | Azure OpenAI and deterministic mock providers                          |
| `tools/indexer`          | Chunks, embeds and reconciles the Azure AI Search index                |
| `eval`                   | Golden set, runner, LLM judge and committed reports                    |
| `infra/terraform`        | Bootstrap, tenant identity, Azure runtime and observability modules    |
| `.github/workflows`      | Verification, reviewed Terraform and the two deployment workflows      |
| `samples/documents`      | Synthetic Portuguese documents and security test cases                 |

## Run it

Node 22 is required (see `.nvmrc`). The unit and mock evaluation paths do not require a live tenant.

```bash
npm install
npm --prefix apps/spfx-assistant install
npm run check
npm run eval:mock
```

The following commands require an operator-configured development environment and two interactive
test users. They do not create infrastructure by themselves.

```bash
npm run test:e2e
npm run eval
```

For deployment, recovery, the precise Terraform-root order and monitoring queries, start with the
[operational runbook](docs/runbook.md).

## Delivery and observability

Every pull request runs formatting, linting, type checking, unit tests, the mock evaluation, a
SharePoint package build and Terraform static checks. Infrastructure pull requests receive a
value-free plan summary. A protected environment approves Azure apply and API deploy jobs, which
authenticate with GitHub OIDC rather than stored Azure credentials.

The Azure environment was destroyed and recreated through that path, followed by local re-registration
of the cross-tenant OBO certificate, API deployment, E2E 4/4 and the real evaluation. See the
[recovery drill](docs/setup/phase-4.md#recovery-drill).

## Roadmap

Phases 0-6 implement the working, governed assistant, its public evidence and the measured comparison
of two retrievers and two prompts. Phase 7 makes ingestion event-driven: a SharePoint change reaches
the index through a versioned event, a queue and an idempotent consumer, verified end to end against
the real tenant, which is what turns indexed retrieval into a defensible default. A Kubernetes phase was planned and [intentionally
dropped](docs/PLAN.md#phase-8--kubernetes--could--intentionally-skipped): it would have demonstrated
packaging, not a missing capability. See the [full plan](docs/PLAN.md).

## License

[MIT](LICENSE)
