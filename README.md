# Context-Aware Enterprise Knowledge Platform

Corporate knowledge assistant embedded in SharePoint: answers questions **citing sources**
and **respecting the permissions** of whoever is asking. Portfolio project with architecture, security,
governed AI and infrastructure as code, at zero cost.

> 🚧 Under construction. Current phase: **2 — Permission-aware answers with citations**. See the [full plan](docs/PLAN.md).

## Language

The repository (code, docs, commit messages) is in English. The synthetic documents in
`samples/documents/` and the assistant's UI stay in pt-BR, since the fictional company and its
users are Brazilian.

## Structure

| Path                     | Content                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `packages/core`          | Query context domain (citations, grounding)                                   |
| `packages/retrievers`    | `GraphSearchRetriever` (AI Search retriever planned for Phase 6)              |
| `packages/llm-providers` | LLM provider abstraction (Azure OpenAI, mock for tests)                       |
| `apps/knowledge-api`     | Azure Functions API (`/api/ask`), token validation, OBO exchange              |
| `apps/spfx-assistant`    | SharePoint Framework extension embedding the assistant                        |
| `prompts/`               | Versioned prompts (`v1.md`, ...) used by the orchestrator                     |
| `tools/sample-docs`      | Generator for the fictional company's `.docx` files                           |
| `samples/documents`      | Synthetic documents, including security test cases                            |
| `infra/terraform`        | Remote state, budget, identity in Entra ID and the Knowledge API Function App |
| `docs/`                  | Plan, setup guides and (soon) architecture and ADRs                           |

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
```

## License

MIT
