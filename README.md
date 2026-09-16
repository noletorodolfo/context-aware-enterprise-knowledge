# Context-Aware Enterprise Knowledge Platform

Corporate knowledge assistant embedded in SharePoint: answers questions **citing sources**
and **respecting the permissions** of whoever is asking. Portfolio project with architecture, security,
governed AI and infrastructure as code, at zero cost.

> 🚧 Under construction. Current phase: **0 — Foundation**. See the [full plan](docs/PLAN.md).

## Language

The repository (code, docs, commit messages) is in English. The synthetic documents in
`samples/documents/` and the assistant's UI stay in pt-BR, since the fictional company and its
users are Brazilian.

## Structure

| Path                | Content                                             |
| ------------------- | --------------------------------------------------- |
| `packages/core`     | Query context domain (citations, grounding)         |
| `tools/sample-docs` | Generator for the fictional company's `.docx` files |
| `samples/documents` | Synthetic documents, including security test cases  |
| `infra/terraform`   | Remote state, budget and identity in Entra ID       |
| `docs/`             | Plan, setup guides and (soon) architecture and ADRs |

## Running locally

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run check          # formatting, lint, typecheck and tests
npm run samples:build  # generates samples/dist/*.docx
```

## License

MIT
