# Phase 4 — Infrastructure and CI/CD: design

- **Status:** approved in conversation (2026-09-18); pending review of this document
- **Scope:** `docs/PLAN.md`, section 11, Phase 4
- **Builds on:** Phase 3 (`docs/superpowers/specs/2026-09-18-phase-3-governance-and-quality-design.md`), ADR-011 (two tenants)
- **Goal:** GitHub Actions verifies every change, applies the Azure infrastructure with approval, and
  deploys the API with no Azure secret in GitHub. Add a workbook and an error alert. Prove that a
  destroyed Azure environment comes back with the pipeline plus one local `terraform apply`, all
  without exposing the partner company on a public repository.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                                                                      | Why                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | CI manages **only the personal subscription**. Terraform is split into two roots with separate state: `envs/dev` (Azure, applied by the pipeline) and `envs/dev-identity` (partner tenant, applied locally by the operator).                                                  | GitHub never holds a credential in the partner tenant.                                                                                            |
| D2  | The repository becomes **public** during this phase. The `dev` environment requires the owner's approval for `apply` and `deploy`.                                                                                                                                            | GitHub Free offers environments and required reviewers only on public repositories. The git history was already rewritten to remove partner data. |
| D3  | Nothing that identifies the partner reaches GitHub. Partner values enter CI as secrets, which Actions masks. Values read from the identity state are masked with `::add-mask::`. Plan and apply output go to files; logs and PR comments show only a resource/action summary. | Public logs, PR comments and artifacts are readable by anyone.                                                                                    |
| D4  | CI builds and tests the `.sppkg` with `config/api.example.json` and never publishes it. The real package keeps being built locally and uploaded by the operator.                                                                                                              | The real package embeds the partner app's client ID.                                                                                              |
| D5  | Recreation is deterministic: a `name_suffix` variable replaces the `random_string` suffixes (set to today's values). The provider purges Key Vault and Azure OpenAI on destroy.                                                                                               | Same names after a recreate mean the same Function URL, so the SharePoint package and local configs keep working.                                 |
| D6  | The DoD is proven for real: destroy `envs/dev`, recreate it through the pipeline, re-register the new OBO certificate with a local `apply` of `envs/dev-identity`, redeploy, and pass the E2E test **without a new `.sppkg`**.                                                | A drill on the real environment is the only convincing proof.                                                                                     |
| D7  | CI identities are user-assigned managed identities with GitHub federated credentials, created in `bootstrap`: `id-kb-ci-plan` (read only, pull requests) and `id-kb-ci-apply` (write, `dev` environment only).                                                                | OIDC with no app registration and no secret. Pull requests cannot write.                                                                          |

Out of scope (YAGNI): Kubernetes (Could), a second environment, SharePoint automation (upload and API
access approval stay manual and documented), OpenAI capacity changes (stays at 10K tokens/min).

## 2. Terraform

### 2.1 Roots

| Root                | Tenant / subscription | Applied by             | Contents                                                                                                          |
| ------------------- | --------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bootstrap`         | personal              | operator (local)       | State storage, budget and **new**: CI managed identities, federated credentials, role assignments                 |
| `envs/dev`          | personal              | pipeline (`infra.yml`) | Resource group, Key Vault and certificate, Azure OpenAI, Function App, App Insights, **new** observability module |
| `envs/dev-identity` | partner               | operator (local)       | `modules/identity` and `azuread_application_certificate` (OBO certificate registration)                           |

- `envs/dev` reads `api_client_id` (and the application object ID) from the `dev-identity` state with
  `terraform_remote_state`.
- `envs/dev-identity` reads the certificate's public data and end date from the `dev` state. The
  certificate resource is created only when that output exists, so an empty environment is built in
  three steps: identity, Azure, identity again. The runbook documents this order.
- Both states live in the existing storage account, with the keys `dev.tfstate` and `dev-identity.tfstate`.

### 2.2 Migration without recreating anything

- `envs/dev-identity` uses `import` blocks for every `azuread_*` resource and the two `random_uuid` (scope and role IDs), with the current IDs.
- `envs/dev` uses `removed { lifecycle { destroy = false } }` blocks for the same addresses.
- Order: apply `dev-identity` (imports only), then `dev` (removals only). Both plans must show
  **0 to destroy**, and the follow-up plans must show no changes. The operator runs both applies locally.

### 2.3 Changes in `envs/dev` and its modules

- `name_suffix` (string, 6 lowercase alphanumerics) replaces `random_string.suffix` in `obo-certificate`,
  `openai` and `function-app`. The migration uses `removed` for the old `random_string`, so no name changes.
- `provider "azurerm" { features { key_vault { purge_soft_delete_on_destroy = true } cognitive_account { purge_soft_delete_on_destroy = true } } }`.
- `operator_object_id` (variable) replaces `data.azurerm_client_config.current` for the operator's
  _Cognitive Services OpenAI User_ (evaluation judge) and _Key Vault Certificates Officer_. The identity
  running Terraform also receives _Key Vault Certificates Officer_ on the vault, so it can create the certificate.
- New `modules/observability` (section 4).

### 2.4 CI identities (`bootstrap`)

| Identity         | Federated subject                     | Roles                                                                                                                        |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id-kb-ci-plan`  | `repo:<owner>/<repo>:pull_request`    | Reader (subscription), Storage Blob Data Contributor (state container, for the lock), Key Vault Certificate User (dev vault) |
| `id-kb-ci-apply` | `repo:<owner>/<repo>:environment:dev` | Contributor and User Access Administrator (subscription), Storage Blob Data Contributor (state container)                    |

The owner and repository names are public; they go in `bootstrap` variables.

## 3. GitHub Actions

All workflows pin actions by commit SHA, set minimal `permissions` per job (`id-token: write` only
where Azure login happens) and use Node 22.

### 3.1 `ci.yml` — every pull request and push to `main`

1. `npm ci`, `npm --prefix apps/spfx-assistant ci`, `npm run check`.
2. `npm run eval:mock`; a failing gate fails the job.
3. SPFx package build with `config/api.example.json` copied to `config/api.json`; no upload.
4. `terraform fmt -check -recursive`; `init -backend=false` and `validate` in `bootstrap`, `envs/dev`, `envs/dev-identity`.
5. `tflint` (azurerm ruleset) and `checkov` on `infra/terraform`. Skips are declared inline with a reason.

### 3.2 `infra.yml` — root `envs/dev`

- **Pull request** touching `infra/**`: login as `id-kb-ci-plan`, mask identity outputs, `plan -out`, then
  `terraform show -json` → a script (`scripts/plan-summary.mjs`, tested) renders a Markdown table of
  address and action plus counts. The table is posted as one PR comment and updated on later pushes.
  Attribute values never appear.
- **Push to `main`** touching `infra/**`, or manual dispatch: job in environment `dev` (owner approval),
  login as `id-kb-ci-apply`, `plan -out`, summary in the job summary, `apply` of that saved plan.
- Terraform stdout and stderr go to files. On failure, only lines starting with `Error:` and their detail
  block are printed, after masking.
- Secrets: `AZURE_CLIENT_ID_PLAN`, `AZURE_CLIENT_ID_APPLY`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `TF_BACKEND_*` (state storage) and `TF_VAR_*` for every `envs/dev` variable (partner tenant ID,
  SharePoint origin, site URLs, operator object ID, name suffix, alert email).

### 3.3 `deploy.yml` — API

- Push to `main` touching `apps/knowledge-api/**`, `packages/**` or `prompts/**`, or manual dispatch.
- Environment `dev` (approval), login as `id-kb-ci-apply`, `npm run package -w @kb/knowledge-api`, publish to
  the Flex Consumption app with `Azure/functions-action`, then smoke test: `POST /api/ask` without a token
  returns 401.

## 4. Observability (`modules/observability`)

- **Workbook** "Knowledge API" (`azurerm_application_insights_workbook`, JSON in the repository):
  1. Volume per hour, split into 2xx, 4xx and 5xx (`AppRequests`, `POST api/ask`).
  2. p50 and p95 latency, end to end, plus p95 of the `llm.generate` and `graph.search` spans.
  3. Refusal rate from `kb.refused` on the `ask` span, by `kb.refusal.reason`.
  4. Failures by dependency from `ask.upstream-failed` logs, by kind and status (Azure OpenAI 429s show here).
- **Alert** `azurerm_monitor_scheduled_query_rules_alert_v2`: 5xx share of `POST api/ask` above 5% over 15
  minutes, evaluated every 15 minutes, only with at least 5 requests in the window. An action group
  emails `alert_email`. Cost about USD 0.50/month; the workbook and the email action group are free.

## 5. Error handling

| Situation                                        | Behavior                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Pull request from a fork                         | Only `ci.yml` runs; no OIDC token, no secrets, no plan comment                              |
| `plan` fails                                     | Job fails with masked `Error:` blocks only; no comment is posted                            |
| `apply` not approved                             | Nothing changes; the run stays waiting or is rejected                                       |
| `dev-identity` state missing (fresh environment) | `envs/dev` fails with a clear message pointing to the three-step order in the runbook       |
| Deploy smoke test fails                          | Job fails; the previous package stays until the next deploy (Flex keeps one active package) |

## 6. Testing

- `scripts/plan-summary.mjs`: unit tests over plan JSON fixtures (create, update, replace, delete, no-op) and
  a test that attribute values present in the JSON never appear in the output.
- Terraform: `fmt`, `validate`, `tflint`, `checkov` in CI; migration plans show 0 to destroy and then no changes.
- Workflows: a test PR that changes a tag shows the summary comment; its merge triggers an approved apply.
- Alert: controlled 5xx requests trigger it, the email arrives, and it resolves afterwards.
- Leak check before the repository goes public and after each drill: tracked files, git history, the
  workflow logs of the test runs and the PR comment are scanned for the real values. Images in `docs/` are reviewed by eye.

## 7. Definition of done

1. `ci.yml` green on a pull request; `infra.yml` comments a summary-only plan on it.
2. Merging applies through the approved `dev` environment; `deploy.yml` publishes the API and the smoke test passes.
3. Workbook shows data after `npm run eval`; the alert fires on a controlled error burst and emails the owner.
4. Drill: `terraform destroy` of `envs/dev`, recreate through `infra.yml`, local `apply` of `envs/dev-identity`,
   `deploy.yml`, then `npm run test:e2e` 4/4 and `npm run eval` passing, with the same `.sppkg`.
5. Repository public; the leak check finds nothing.
6. `docs/setup/phase-4.md` runbook; README and PLAN updated.

## 8. Execution order

1. Terraform: `name_suffix`, `operator_object_id`, purge settings; split roots with `import`/`removed` (operator applies both, 0 to destroy).
2. `bootstrap`: CI identities and roles (operator applies).
3. `modules/observability` (applied locally first, to check the workbook and alert).
4. `scripts/plan-summary.mjs` with tests; `ci.yml`, `infra.yml`, `deploy.yml`.
5. Leak check; operator makes the repository public, creates the `dev` environment and the secrets.
6. Test PR → plan comment → merge → approved apply → deploy.
7. Alert test.
8. Drill (DoD 4).
9. Documentation.
