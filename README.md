# Context-Aware Enterprise Knowledge Platform

Corporate knowledge assistant embedded in SharePoint: answers questions **citing sources**
and **respecting the permissions** of whoever is asking. Portfolio project with architecture, security,
governed AI and infrastructure as code, at zero cost.

> 🚧 Under construction. Current phase: **3 — Governance and quality** (done; next: 4 — Infrastructure and CI/CD). See the [full plan](docs/PLAN.md).

## Language

The repository (code, docs, commit messages) is in English. The synthetic documents in
`samples/documents/` and the assistant's UI stay in pt-BR, since the fictional company and its
users are Brazilian.

## Structure

| Path                     | Content                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `packages/core`          | Query context domain (citations, grounding)                                   |
| `packages/retrievers`    | `GraphSearchRetriever` (AI Search retriever planned for Phase 6)              |
| `packages/governance`    | PII detection and masking (CPF, CNPJ, email, phone)                           |
| `packages/llm-providers` | LLM provider abstraction (Azure OpenAI, mock for tests)                       |
| `apps/knowledge-api`     | Azure Functions API (`/api/ask`), token validation, OBO exchange              |
| `apps/spfx-assistant`    | SharePoint Framework extension embedding the assistant                        |
| `prompts/`               | Versioned prompts: answer (`v1.md`) and evaluation judge (`judge-v1.md`)      |
| `eval/`                  | Golden set, evaluation runner, LLM judge and committed reports                |
| `test-support/`          | Shared test helpers: test-user sign-in, in-memory OpenTelemetry               |
| `tools/sample-docs`      | Generator for the fictional company's `.docx` files                           |
| `samples/documents`      | Synthetic documents, including security test cases                            |
| `infra/terraform`        | Remote state, budget, identity in Entra ID and the Knowledge API Function App |
| `docs/`                  | Plan, setup guides and (soon) architecture and ADRs                           |

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
