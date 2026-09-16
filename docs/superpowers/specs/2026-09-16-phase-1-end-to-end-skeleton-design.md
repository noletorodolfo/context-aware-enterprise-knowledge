# Phase 1 — End-to-end skeleton: design

- **Status:** approved (2026-09-16)
- **Scope:** `docs/PLANO.md`, section 11, Phase 1
- **Goal:** on the real SharePoint demo site, a user clicks a floating button, asks a question and
  receives an authenticated **mock** answer. Without a valid token the API returns `401`.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                                     | Why                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Provision the Function App with Terraform **now** (new `function-app` module), deploy code manually with `func azure functionapp publish`. The CI/CD pipeline stays in Phase 4.                                                              | Keeps the project 100% IaC from the first compute resource (ADR-010).                                                             |
| D2  | Ship the `.sppkg` to the **tenant** App Catalog without tenant-wide deployment (`skipFeatureDeployment: false`) and add the app **only** to `/sites/kb-demo`.                                                                                | The button must not appear on the partner's real department sites. API permission requests are processed from the tenant catalog. |
| D3  | Phase 1 uses a deterministic `MockLlmProvider`. **Phase 2 uses Azure OpenAI** as the primary provider (GitHub Models as free fallback). ADR-006 and the budget alert (USD 1 → USD 5) are updated in Phase 2.                                 | Phase 1 isolates plumbing failures (token, CORS, deploy) from AI behavior.                                                        |
| D4  | Repository content is in English. Exceptions: synthetic documents (`samples/documents`), assistant UI strings and the eval golden set stay in pt-BR. Existing Phase 0 docs and code comments are translated as the first task of this phase. | International portfolio audience; the fictional company and its users are Brazilian.                                              |
| D5  | The SPFx solution lives **outside** the npm workspaces, with its own lockfile.                                                                                                                                                               | SPFx pins its own toolchain and TypeScript version; mixing them breaks builds.                                                    |
| D6  | Everything paid runs in the personal subscription. A partner-owned deployment later is a new environment (e.g. `envs/partner`) reusing the same modules, subject to a new agreement.                                                         | Zero cost for the partner; portability by configuration only.                                                                     |

Out of scope for Phase 1 (YAGNI): conversation history, OBO and Graph Search, PII filtering, full
OpenTelemetry, deployment pipeline.

## 2. Components

### 2.1 `packages/llm-providers` (new)

- `LlmProvider` interface: `generate(input: { question: Question; user: { name: string } }): Promise<Answer>`.
- `MockLlmProvider`: deterministic. Returns an `Answer` whose text repeats the question, the user's
  display name (from the token) and the page title; `citations: []`, `refused: false`,
  `promptVersion: "mock"`. Proves that token and page context reached the backend.

### 2.2 `apps/knowledge-api` (new, Azure Functions v4 Node model, TypeScript)

- `POST /api/ask` — body `{ question: string, page: PageContext }` → `Answer` (types from `@kb/core`).
- `auth/` — validates the bearer token **in code** with `jose`:
  - signature against the Entra ID JWKS of the configured tenant;
  - issuer `https://login.microsoftonline.com/{TENANT_ID}/v2.0`;
  - audience equals `API_CLIENT_ID` (v2 tokens);
  - `tid` equals `TENANT_ID`;
  - `scp` contains `user_impersonation`;
  - any failure → `401` with no detail in the body; the reason is logged.
- Body validation with `zod`: question trimmed, 1–1000 chars; `page.url`, `page.title`, `page.siteUrl` required.
- Configuration via app settings only: `TENANT_ID`, `API_CLIENT_ID`. No secrets.

### 2.3 `infra/terraform/modules/function-app` (new)

- Flex Consumption Function App (Node 22, Linux) with its own storage account (no shared keys where
  supported), Log Analytics workspace + Application Insights, system-assigned managed identity.
- CORS restricted to the SharePoint origin (variable; real value only in the git-ignored `tfvars`).
- App settings `TENANT_ID` and `API_CLIENT_ID` wired from the `identity` module outputs.
- `envs/dev` gains the `azurerm` provider (personal subscription) alongside `azuread` (partner tenant).
- Required resource providers (`Microsoft.Web`, `Microsoft.Insights`, `Microsoft.OperationalInsights`)
  are registered before the first apply. Flex Consumption availability in `brazilsouth` is checked
  at plan time; if unavailable, the Function App region becomes a variable.

### 2.4 `apps/spfx-assistant` (new, SPFx 1.22, React, Fluent UI)

- Application Customizer rendering into the `Bottom` placeholder: floating button + chat panel.
- Accessibility: keyboard operable, focus moves to the input on open, `Esc` closes and returns focus
  to the button, answers announced through `aria-live`.
- `KnowledgeApiClient` uses `AadHttpClient` for resource `api://<API_CLIENT_ID>`; sends a W3C
  `traceparent` header; 30 s timeout.
- `package-solution.json`: `skipFeatureDeployment: false`, `webApiPermissionRequests` for
  `kb-knowledge-api-dev` / `user_impersonation`.
- API base URL and client id come from a local config file (committed `.example`, real file
  git-ignored) so the public repository carries no partner identifiers.
- The request/response contract is duplicated in a small `contract.ts`; the API's typecheck imports
  it and asserts compatibility with `@kb/core`, so drift fails the build.

## 3. Request flow

1. User opens the panel; focus goes to the input.
2. On submit the SPFx builds `{ question, page: { url, title, siteUrl, listTitle? } }`.
3. `AadHttpClient` acquires a token for `api://<client-id>/user_impersonation` (approved once under
   "API access" in the SharePoint Admin Center).
4. `POST https://<function-app>.azurewebsites.net/api/ask` with `Authorization: Bearer …` and `traceparent`.
5. API validates the token, validates the body, calls `MockLlmProvider`, returns the `Answer`.
6. The panel renders the answer with a "test answer" badge while the mock is active.

## 4. Error handling

| Situation                                                     | API                                       | User sees (pt-BR)                                                           |
| ------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Missing/invalid/expired token, wrong tenant, missing scope    | `401`, empty detail; reason logged        | "Não foi possível autenticar. Recarregue a página."                         |
| Invalid body                                                  | `400` with the offending field            | "Escreva uma pergunta de até 1.000 caracteres." (validated client-side too) |
| Unhandled error                                               | `500` with correlation id, no stack trace | "O assistente teve um problema. Tente de novo."                             |
| API unreachable, timeout, `503` (e.g. suspended subscription) | —                                         | "Assistente indisponível no momento."                                       |
| Token acquisition fails (API access not approved)             | —                                         | "Assistente não configurado neste site."                                    |

Rules: question and answer text are **never** logged — only length, duration, status and correlation
id (PLANO section 5). The panel never hangs: every failure ends in an error state with "Tentar de novo".

## 5. Testing

Automated (part of `npm run check`, later CI):

- **Token validation** (Vitest, locally generated key pair and JWKS): valid token passes; `401` for
  missing, expired, bad signature, wrong audience, wrong tenant, missing scope.
- **Body validation:** empty, > 1000 chars, missing page → `400`.
- **Handler:** valid request → `Answer` containing user name and page title; thrown error → `500`
  with correlation id and no stack; question text absent from logs.
- **Contract:** SPFx `contract.ts` assignable to `@kb/core` types (typecheck).
- **`MockLlmProvider`:** same input, same output.
- **SPFx** (Jest from the SPFx toolchain): client maps `401`/`400`/`500`/timeout/network error to the
  right message; panel focus on open, `Esc` closes, `aria-live` region updated.
- **Terraform:** `fmt -check`, `validate`; every `apply` runs from a saved plan reviewed by the user.

Manual acceptance on the real site (definition of done):

| Check                                                 | Expected                               |
| ----------------------------------------------------- | -------------------------------------- |
| User A asks a question on `kb-demo`                   | Mock answer with A's name + page title |
| User B does the same                                  | Mock answer with B's name              |
| `curl` without token                                  | `401`                                  |
| `curl` with a token for another audience (e.g. Graph) | `401`                                  |
| Open a partner department site                        | No button                              |
| Keyboard only (Tab, Enter, Esc)                       | Fully usable                           |

Plus `npm run check` green and `docs/setup/phase-1.md` with steps and pitfalls.

## 6. Execution order

0. Translate repository to English (D4).
1. `packages/llm-providers` with the mock.
2. `apps/knowledge-api` with tests.
3. Terraform `function-app` module: plan, review, apply.
4. Deploy API; verify `401` with `curl`.
5. SPFx: button, panel, client.
6. Upload `.sppkg`, approve API access, add app to `kb-demo`.
7. Acceptance tests with A and B, `phase-1.md`, commit.
