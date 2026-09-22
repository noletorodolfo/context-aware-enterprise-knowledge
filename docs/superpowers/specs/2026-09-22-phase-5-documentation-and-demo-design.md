# Phase 5 - Documentation and demo: design

- **Status:** approved for implementation (2026-09-22)
- **Scope:** `docs/PLAN.md`, section 11, Phase 5
- **Builds on:** the implemented Phases 0-4
- **Goal:** make the project understandable to a technical outsider from the repository alone, while
  preserving the separation between synthetic, public evidence and the private partner environment.

## 1. Decisions

| #   | Decision                                                                                                                                                                         | Why                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The README becomes the product entry point: problem, outcome, evidence, architecture, security, quality and a short path to run it.                                              | A reviewer should understand the value in under five minutes.                                                                             |
| D2  | The architecture, security, operational runbook and certification evidence are separate documents linked from the README.                                                        | Each audience gets a focused, reviewable artifact instead of a single long document.                                                      |
| D3  | The public demonstration uses only existing anonymized screenshots and synthetic examples. The live partner site, tenant identifiers, URLs, users and logs remain out of GitHub. | Public evidence must not expose the partner.                                                                                              |
| D4  | A two-minute video is recorded locally by the operator using the supplied script. A repository GIF is optional and may only be added after a visual leak review.                 | A recording needs the operator's browser session; a safe README does not depend on committing a potentially identifying screen recording. |
| D5  | ADRs document the actual decisions already implemented. The existing plan is a roadmap, not an ADR source of truth.                                                              | The portfolio needs auditable decisions with context, trade-offs and reversibility.                                                       |
| D6  | Every claimed result links to code, a runbook, a test, or an anonymized report. No success claim depends on an unverifiable live-environment assertion.                          | This keeps the public portfolio credible.                                                                                                 |

## 2. Public documentation set

| Artifact                 | Reader question it answers                                                      |
| ------------------------ | ------------------------------------------------------------------------------- |
| `README.md`              | What problem does this solve, how is it demonstrated, and what has been proven? |
| `docs/architecture.md`   | How do the components, data flows, tenants and quality attributes fit together? |
| `docs/security.md`       | What are the threats, controls, residual risks and data boundaries?             |
| `docs/runbook.md`        | How is the system configured, deployed, verified, recovered and operated?       |
| `docs/certifications.md` | Which certification or book concepts have concrete repository evidence?         |
| `docs/adr/001-010-*.md`  | Why was each consequential choice made, and how can it be reversed?             |
| `docs/setup/phase-5.md`  | What was produced in this phase and how can the public demo be recorded safely? |

## 3. README content contract

1. One-sentence product statement, CI badge and a concise result banner.
2. A "What it proves" section: cited answers, permission trimming, PII protection, evaluation,
   telemetry and reproducible delivery.
3. An anonymized demo image or a clearly labelled optional media placeholder; no real hostnames,
   tenant names, user names, opaque IDs or browser address bars with identifiable values.
4. A compact system diagram and links to the detailed architecture and security documents.
5. The real evaluation baseline: hard gates, quality targets and the note that the corpus is synthetic
   and intentionally small.
6. Setup commands split between safe local checks and live-environment tests requiring operator config.
7. A short roadmap that distinguishes implemented work from Phase 6+ plans.

## 4. Architecture and security contract

- Architecture uses C4-style system context and container diagrams. It describes the two-tenant
  boundary generically: a Microsoft 365 tenant holds identity and documents; a separate Azure
  subscription holds runtime resources.
- The runtime flow shows browser `traceparent` -> JWT validation -> OBO -> permission-trimmed Graph
  retrieval -> Azure OpenAI -> grounding -> cited response.
- The delivery flow shows GitHub Actions OIDC for the Azure subscription only; partner identity stays
  local to the operator.
- The security document includes a compact STRIDE table and explicitly states: no content in logs,
  PII masking before retrieval/generation, Key Vault signing, structured model output, citation
  grounding, evaluator-only diagnostics and GitHub secret handling.
- Residual risks include model variance, content filters, Graph availability, synthetic-corpus limits
  and manual SharePoint package publishing.

## 5. ADR contract

Create the following English ADRs using a common format: status, context, decision, alternatives,
consequences and reversal.

| ADR | Decision                                                     |
| --- | ------------------------------------------------------------ |
| 001 | Custom knowledge assistant rather than Microsoft 365 Copilot |
| 002 | SPFx Application Customizer in the Bottom placeholder        |
| 003 | `AadHttpClient` and Entra-protected API                      |
| 004 | Permission trimming through Graph Search with OBO            |
| 005 | Retriever and LLM provider abstractions                      |
| 006 | Azure OpenAI with managed identity and a deterministic mock  |
| 007 | Secretless runtime and delivery authentication               |
| 008 | Event-driven ingestion as the Phase 7 direction              |
| 009 | OpenTelemetry and W3C trace context                          |
| 010 | Terraform, remote state and reviewed OIDC delivery           |

ADR-011 already exists as a project-level decision in the implemented documents; it is linked from
architecture and security rather than retroactively invented as a new Phase 5 artifact.

## 6. Demo script and media safety

The runbook supplies a 120-second operator script:

1. state the problem and show the SharePoint page;
2. ask a public-policy question and open a citation;
3. switch to the restricted user and show the safe refusal for the restricted question;
4. show the evaluation report and one trace/workbook query;
5. show the green CI workflow and Terraform plan summary;
6. close with the implemented controls and Phase 6 roadmap.

Before publishing any new screenshot, GIF or video: hide the browser address bar, redact tenant and
user identifiers, use only synthetic text, and inspect every frame at full resolution. A video is
referenced externally only after the operator chooses a hosting location and confirms it is safe.

## 7. Verification and definition of done

1. All documentation links resolve locally and `npm run check` passes.
2. A repository-wide identifier scan finds no values from git-ignored live configuration files.
3. README claims match committed evaluation reports, tests and Phase 4 runbook.
4. The media review confirms that existing images and any new artifact are anonymous.
5. The operator can record the demo by following `docs/setup/phase-5.md` without needing hidden
   context from this conversation.
