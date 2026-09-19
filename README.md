# Context-Aware Enterprise Knowledge Platform

[![ci](https://github.com/noletorodolfo/context-aware-enterprise-knowledge/actions/workflows/ci.yml/badge.svg)](https://github.com/noletorodolfo/context-aware-enterprise-knowledge/actions/workflows/ci.yml)

Corporate knowledge assistant embedded in SharePoint: answers questions **citing sources**
and **respecting the permissions** of whoever is asking. Portfolio project with architecture, security,
governed AI and infrastructure as code, at zero cost.

> 🚧 Under construction. Current phase: **4 — Infrastructure and CI/CD** (done; next: 5 — Documentation and demo). See the [full plan](docs/PLAN.md).

## Language

The repository (code, docs, commit messages) is in English. The synthetic documents in
`samples/documents/` and the assistant's UI stay in pt-BR, since the fictional company and its
users are Brazilian.

## Structure

| Path                     | Content                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `packages/core`          | Query context domain (citations, grounding)                                |
| `packages/retrievers`    | `GraphSearchRetriever` (AI Search retriever planned for Phase 6)           |
| `packages/governance`    | PII detection and masking (CPF, CNPJ, email, phone)                        |
| `packages/llm-providers` | LLM provider abstraction (Azure OpenAI, mock for tests)                    |
| `apps/knowledge-api`     | Azure Functions API (`/api/ask`), token validation, OBO exchange           |
| `apps/spfx-assistant`    | SharePoint Framework extension embedding the assistant                     |
| `prompts/`               | Versioned prompts: answer (`v1.md`) and evaluation judge (`judge-v1.md`)   |
| `eval/`                  | Golden set, evaluation runner, LLM judge and committed reports             |
| `test-support/`          | Shared test helpers: test-user sign-in, in-memory OpenTelemetry            |
| `tools/sample-docs`      | Generator for the fictional company's `.docx` files                        |
| `samples/documents`      | Synthetic documents, including security test cases                         |
| `infra/terraform`        | Remote state, budget, CI identities, Azure resources and Entra ID identity |
| `.github/workflows`      | `ci` (checks), `infra` (Terraform plan/apply), `deploy` (API)              |
| `docs/`                  | Plan, setup guides and (soon) architecture and ADRs                        |

## Quality

The assistant is measured against a 30-question golden set
(`npm run eval`, report in [`eval/reports/`](eval/reports/)). First report, prompt v1 on
gpt-4.1-mini:

| Hard gates (must be 100%)                   | Result |
| ------------------------------------------- | ------ |
| No leak: user B never receives HR documents | ✅     |
| Prompt injection in a document is ignored   | ✅     |
| Personal data masked and never echoed       | ✅     |

| Quality                            | Result | Target |
| ---------------------------------- | ------ | ------ |
| Expected document in the top 3     | 100%   | ≥ 80%  |
| Answers with a valid citation      | 100%   | ≥ 90%  |
| Correct refusals                   | 100%   | ≥ 90%  |
| Groundedness (LLM judge score ≥ 4) | 100%   | ≥ 85%  |
| End-to-end latency p95             | 4.8 s  | < 8 s  |

The corpus has 8 synthetic documents, so these numbers are a regression baseline, not a
prediction for a real intranet. Every request is traced with OpenTelemetry from the SharePoint
panel to the model call in Application Insights.

## Delivery

Every pull request runs lint, typecheck, unit tests, the structural evaluation, the SharePoint package
build and Terraform checks (fmt, validate, tflint, checkov). Infrastructure changes get a Terraform plan
summary as a PR comment; merging applies them after the owner approves. The API deploys the same way.
GitHub signs in to Azure with OIDC, so no Azure secret is stored. Logs and comments never show values
from the partner tenant. A destroy-and-recreate drill brought the whole Azure environment back through
the pipeline, with the same SharePoint package ([runbook](docs/setup/phase-4.md)).

## Running locally

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm --prefix apps/spfx-assistant install  # apps/spfx-assistant is a standalone SPFx project
                                           # (own package.json/lockfile); its deps aren't hoisted
                                           # by the root workspaces install
npm run check          # formatting, lint, typecheck and tests (includes the spfx unit tests)
npm run samples:build  # generates samples/dist/*.docx
npm run test:e2e       # no-leak end-to-end test against a deployed dev environment;
                       # signs in interactively as two test users (A and B) on first run
npm run eval:mock      # golden set in process (mock model, no Azure)
npm run eval           # golden set against the deployed API, with the LLM judge
```

## License

MIT
