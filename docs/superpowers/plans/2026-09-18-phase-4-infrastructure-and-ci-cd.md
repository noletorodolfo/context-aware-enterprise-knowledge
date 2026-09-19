# Phase 4 — Infrastructure and CI/CD Implementation Plan

> **For agentic workers:** executed inline in this session (the owner asked for no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions verifies every change, applies the Azure root with the owner's approval and deploys the API through OIDC. Add a workbook and an error alert, and prove recovery with a destroy/recreate drill, without exposing the partner on the public repository.

**Architecture:** The Terraform `envs/dev` root splits into `envs/dev` (personal subscription, pipeline) and `envs/dev-identity` (partner tenant, operator), linked by `terraform_remote_state`. Two user-assigned managed identities with GitHub federated credentials (plan, apply) come from `bootstrap`. Three workflows (`ci`, `infra`, `deploy`) print only masked, summarized Terraform output.

**Tech Stack:** Terraform 1.9+ (`azurerm ~> 5.5`, `azuread ~> 3.9`), GitHub Actions, `azure/login` (OIDC), `Azure/functions-action`, tflint, checkov, Node 22 + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-phase-4-infrastructure-and-ci-cd-design.md`

## Global Constraints

- No partner identifier in any tracked file, git history, workflow log, PR comment or artifact. Real values live in git-ignored `terraform.tfvars`/`backend.hcl` files or in GitHub secrets.
- The operator applies `bootstrap` and `envs/dev-identity` locally; `envs/dev` is applied by `infra.yml` after migration. The assistant may run `init`, `validate`, `fmt`, `plan` and `output`, never `apply`, `destroy` or `state push`.
- Azure OpenAI capacity stays at 10 (10K tokens/minute).
- Repository content in English; commit messages without AI attribution.
- Every migration plan must show **0 to destroy**, and each follow-up plan must show no changes.
- Workflows pin third-party actions by full commit SHA and declare minimal `permissions`.

**Deviation from the spec (§2.2):** `import` blocks would put the partner's object IDs in tracked `.tf` files. The resources move between states with `terraform state mv` on local copies instead, which the operator runs. No IDs are written to files.

## Review Focus

1. Split order: if `envs/dev-identity` is planned before `envs/dev` publishes the certificate outputs, the certificate registration would be destroyed. Guarded by publishing the outputs first (Task 1) and by a `precondition` in Task 2.
2. The plan summary must never print attribute values, even when a value appears inside a resource address (a `for_each` key). Tested in Task 5.
3. Plans run by `id-kb-ci-plan` (Reader) can fail on `list*` actions (app settings, keys). Task 8 checks this with a real PR plan; the fix is a minimal custom role, never Contributor.
4. A fork pull request must never reach an OIDC job. Guarded by `if: github.event.pull_request.head.repo.full_name == github.repository` (Task 7).
5. A drill with purge enabled must recreate the Key Vault and OpenAI under the same names (Task 10).

---

### Task 1: Publish certificate outputs before the split

**Files:** Modify `infra/terraform/envs/dev/outputs.tf`.

- [ ] Add outputs `obo_certificate` (`{ data_base64, end_date }` from `module.obo_certificate`), `application_insights_id` and `log_analytics_workspace_id` (Task 4 needs them; add the matching outputs in `modules/function-app/outputs.tf`).
- [ ] `terraform fmt`, `validate`, `plan` → "Changes to Outputs" only, 0 to add/change/destroy.
- [ ] Operator applies. Commit `feat(infra): publish certificate and monitoring outputs`.

### Task 2: Split the roots

**Files:**

- Create: `infra/terraform/envs/dev-identity/{main.tf,variables.tf,outputs.tf,terraform.tfvars.example}`
- Modify: `infra/terraform/envs/dev/{main.tf,variables.tf,outputs.tf,terraform.tfvars.example}`, `modules/{obo-certificate,openai,function-app}/{main.tf,variables.tf}`

**Interfaces — Produces:** `dev-identity` outputs `knowledge_api_client_id`, `knowledge_api_application_id`, `knowledge_api_identifier_uri`, `e2e_client_id`, `evaluator_role_id`, `identity` (module). `dev` variables `name_suffixes` (`object({ function_app = string, openai = string, key_vault = string })`), `operator_object_id`, `ci_plan_principal_id` and `ci_apply_principal_id` (the last two default to `null` until Task 3).

- [ ] `envs/dev-identity/main.tf`:
  - `backend "azurerm" {}` with key `dev-identity.tfstate`, and providers `azuread` (`tenant_id = var.tenant_id`) and `random`.
  - `module "identity"` (unchanged inputs).
  - `data "terraform_remote_state" "azure"` pointing at `dev.tfstate`, with the same backend settings passed through the variables `state_resource_group_name`, `state_storage_account_name` and `state_container_name`.
  - `azuread_application_certificate.knowledge_api_obo` (same arguments, values from `data.terraform_remote_state.azure.outputs.obo_certificate`).
  - A `lifecycle { precondition }` that fails with "Apply envs/dev first: its obo_certificate output is missing" when the output is absent. This way an empty environment never plans to delete the registration.
- [ ] `envs/dev/main.tf`:
  - Remove `module "identity"` and `azuread_application_certificate`, and the `azuread` provider.
  - Add `data "terraform_remote_state" "identity"` (key `dev-identity.tfstate`) and use `...outputs.knowledge_api_client_id` for `api_client_id`.
  - Provider features `key_vault.purge_soft_delete_on_destroy = true` and `cognitive_account.purge_soft_delete_on_destroy = true`.
  - `operator_openai` uses `var.operator_object_id`; drop `data.azurerm_client_config.current`.
  - `removed` blocks (`lifecycle { destroy = false }`) for `module.function_app.random_string.suffix`, `module.openai.random_string.suffix` and `module.obo_certificate.random_string.suffix`.
- [ ] Modules: `var.name_suffix` replaces `random_string.suffix`. In `obo-certificate`, `var.operator_object_id` replaces the current principal for `operator_certificates`. New `azurerm_role_assignment` for `var.ci_apply_principal_id` (Certificates Officer) and `var.ci_plan_principal_id` (Certificate User), each with `count = var.x == null ? 0 : 1`.
- [ ] Move `outputs` that belong to identity (`identity`, `e2e_client_id`, `knowledge_api_identifier_uri`) to `dev-identity`.
- [ ] Update both `terraform.tfvars.example` files with placeholder values only.
- [ ] `fmt -recursive`, and `init -backend=false` + `validate` in both roots. Commit `refactor(infra): split the partner-tenant identity into its own root`.
- [ ] **State migration (operator, local; the exact commands go into the runbook):**
  1. `envs/dev-identity`: create `backend.hcl` (key `dev-identity.tfstate`) and `terraform.tfvars`; `init`.
  2. `envs/dev`: `terraform state pull > dev.json`.
  3. `terraform state mv -state=dev.json -state-out=identity.json <addr> <addr>` for each `module.identity.*` resource and `azuread_application_certificate.knowledge_api_obo`.
  4. `envs/dev-identity`: `terraform state push identity.json`. `envs/dev`: `terraform state push dev.json`.
  5. Add `name_suffixes` (current suffixes, read by the assistant from `state show`) and `operator_object_id` to `envs/dev/terraform.tfvars`.
  6. `dev-identity`: `plan` → no resource changes (outputs only), then apply. `dev`: `plan` → only the three `random_string` "will no longer be managed", 0 to destroy, then apply. Both follow-up plans: no changes.
  7. Delete `dev.json`/`identity.json`: they contain state.

### Task 3: CI identities in `bootstrap`

**Files:** Modify `infra/terraform/bootstrap/{main.tf,variables.tf,outputs.tf,terraform.tfvars.example}`.

- [ ] Variables: `github_repository` (`"noletorodolfo/context-aware-enterprise-knowledge"`) and `ci_location` (default `var.location`).
- [ ] `azurerm_resource_group.ci` (`rg-kb-ci`) and the managed identities `azurerm_user_assigned_identity.ci_plan` (`id-kb-ci-plan`) and `ci_apply` (`id-kb-ci-apply`).
- [ ] `azurerm_federated_identity_credential`:
  - plan: subject `repo:${var.github_repository}:pull_request`;
  - apply: subject `repo:${var.github_repository}:environment:dev`;
  - both with issuer `https://token.actions.githubusercontent.com` and audience `api://AzureADTokenExchange`.
- [ ] Role assignments:
  - plan: `Reader` on the subscription and `Storage Blob Data Contributor` on the state container;
  - apply: `Contributor` and `User Access Administrator` on the subscription, and `Storage Blob Data Contributor` on the state container.
- [ ] Outputs: `ci_plan_client_id`, `ci_apply_client_id`, `ci_plan_principal_id`, `ci_apply_principal_id`. These are not partner values, but they stay out of tracked files anyway.
- [ ] `fmt`/`validate`/`plan` → only additions. Operator applies. The principal IDs go into `envs/dev/terraform.tfvars`, and a `dev` plan shows the two Key Vault role assignments; operator applies.
- [ ] Commit `feat(infra): add GitHub OIDC identities for plan and apply`.

### Task 4: Observability module

**Files:**

- Create: `infra/terraform/modules/observability/{main.tf,variables.tf,outputs.tf,workbook.json}`
- Modify: `infra/terraform/envs/dev/{main.tf,variables.tf}`

- [ ] Variables: `resource_group_name`, `location`, `tags`, `application_insights_id`, `log_analytics_workspace_id`, `alert_email`, `environment`.
- [ ] `azurerm_application_insights_workbook` "Knowledge API": `data_json = templatefile("${path.module}/workbook.json", { app_insights_id = var.application_insights_id })`, with a stable `name` from `uuidv5("url", "kb-workbook-${var.environment}")`. Four KQL query items, over the last 24 h by default:
  1. `AppRequests | where Name == "POST api/ask" | summarize count() by bin(TimeGenerated, 1h), class = strcat(substring(ResultCode, 0, 1), "xx")`.
  2. `AppRequests | where Name == "POST api/ask" | summarize p50 = percentile(DurationMs, 50), p95 = percentile(DurationMs, 95) by bin(TimeGenerated, 1h)` plus `AppDependencies | where Name in ("llm.generate", "graph.search") | summarize p95 = percentile(DurationMs, 95) by Name, bin(TimeGenerated, 1h)`.
  3. `AppDependencies | where Name == "ask" | extend refused = tostring(Properties["kb.refused"]) == "true", reason = tostring(Properties["kb.refusal.reason"]) | summarize total = count(), refused = countif(refused) by bin(TimeGenerated, 1h), reason`.
  4. `AppTraces | where Message has "ask.upstream-failed" | extend d = parse_json(Message) | summarize count() by errKind = tostring(d["kind"]), httpStatus = tostring(d.status)`.
- [ ] `azurerm_monitor_action_group` (`ag-kb-dev`, short name `kbdev`), with an email receiver for `var.alert_email`.
- [ ] `azurerm_monitor_scheduled_query_rules_alert_v2` (`alert-kb-dev-error-rate`), scope `var.application_insights_id`, `evaluation_frequency = "PT15M"`, `window_duration = "PT15M"`, severity 2, and the query `requests | where name == "POST api/ask" | summarize total = count(), failed = countif(toint(resultCode) >= 500) | where total >= 5 | extend rate = 100.0 * failed / total | where rate > 5`. Criteria: `Count` of rows `GreaterThan 0`, action = the action group, `auto_mitigation_enabled = true`.
- [ ] Wire into `envs/dev` with the new function-app outputs and `var.alert_email`.
- [ ] `fmt`/`validate`/`plan` → only additions. Operator applies. Open the workbook in the portal after `npm run eval`. Commit `feat(infra): add Knowledge API workbook and error-rate alert`.

### Task 5: Plan summary script (TDD)

**Files:**

- Create: `scripts/plan-summary.mjs`, `scripts/plan-summary.test.mjs`
- Modify: `vitest.config.ts` (include `scripts/**/*.test.mjs`)

**Interfaces — Produces:** `summarizePlan(plan: object): string` (Markdown), CLI `node scripts/plan-summary.mjs <plan.json>` → Markdown on stdout.

- [ ] Tests first:
  - create/update/delete/replace/no-op rows and the counts line (`**Plan:** 1 to add, 1 to change, 1 to destroy (1 replaced)`);
  - `no-op` and `read` are omitted; "No changes." when nothing changes;
  - no attribute value from `before`/`after` appears in the output (fixture with the sentinel `SECRET-VALUE-123`);
  - a `for_each` key in an address is replaced by `[…]` (keys can carry values);
  - output changes are listed by name only.
- [ ] Implement: read `resource_changes[]` (`address`, `change.actions`) and `output_changes` (names).
  - Action mapping: `["create"]` → create, `["update"]` → update, `["delete"]` → **destroy**, `["delete","create"]`/`["create","delete"]` → replace.
  - Replace every `["…"]` index in addresses with `[…]`; keep numeric `[0]`.
  - Emit a Markdown table.
- [ ] `npm test` green. Commit `feat(ci): add a value-free Terraform plan summary`.

### Task 6: `ci.yml`

**Files:** Create `.github/workflows/ci.yml`, `.tflint.hcl` (root, azurerm ruleset) and `.checkov.yaml` (framework terraform, directory `infra/terraform`).

- [ ] Triggers: `pull_request` and `push` to `main`. `permissions: contents: read`. Concurrency per ref.
- [ ] Job `verify` (ubuntu-latest):
  1. checkout;
  2. setup-node 22 with npm cache;
  3. `npm ci` and `npm --prefix apps/spfx-assistant ci`;
  4. `npm run check`;
  5. `npm run eval:mock`;
  6. `cp apps/spfx-assistant/config/api.example.json apps/spfx-assistant/config/api.json && npm --prefix apps/spfx-assistant run build`.
- [ ] Job `terraform`:
  1. setup-terraform (pinned version), then `terraform fmt -check -recursive infra/terraform`;
  2. in `bootstrap`, `envs/dev` and `envs/dev-identity`: `terraform init -backend=false` + `validate`;
  3. setup-tflint, `tflint --init`, then `tflint --recursive --chdir infra/terraform`;
  4. checkov on `infra/terraform`.
- [ ] Every skip is added inline (`#checkov:skip=CKV_...: reason`) only after reading the finding. Look up the action SHAs with `gh api repos/<owner>/<action>/git/ref/tags/<tag>`.
- [ ] Run tflint and checkov locally where available; otherwise the first PR run is the check. Commit `ci: add verification workflow`.

### Task 7: `infra.yml` and `deploy.yml`

**Files:** Create `.github/workflows/infra.yml`, `.github/workflows/deploy.yml`, `scripts/terraform-ci.sh`.

**Interfaces — Consumes:** secrets `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_CLIENT_ID_PLAN`, `AZURE_CLIENT_ID_APPLY`, `TF_BACKEND_RESOURCE_GROUP`, `TF_BACKEND_STORAGE_ACCOUNT`, `TF_BACKEND_CONTAINER`, and `TF_VAR_*` for every `envs/dev` variable (`TF_VAR_TENANT_ID`, `TF_VAR_SUBSCRIPTION_ID`, `TF_VAR_OWNER`, `TF_VAR_SHAREPOINT_ORIGIN`, `TF_VAR_SEARCH_SITE_URLS` as JSON, `TF_VAR_NAME_SUFFIXES` as JSON, `TF_VAR_OPERATOR_OBJECT_ID`, `TF_VAR_CI_PLAN_PRINCIPAL_ID`, `TF_VAR_CI_APPLY_PRINCIPAL_ID`, `TF_VAR_ALERT_EMAIL`, `TF_VAR_STATE_*`), plus `FUNCTION_APP_NAME`.

- [ ] `scripts/terraform-ci.sh <plan|apply>`, run in `envs/dev`, with `set -euo pipefail`:
  - `init` with `-backend-config` from the env vars and `-input=false`, output to a log file;
  - mask the identity outputs before any Terraform command: download `dev-identity.tfstate` with `az storage blob download --auth-mode login`, `jq` every string output value, and `echo "::add-mask::$v"` for each, then delete the file;
  - `plan -out=tfplan -input=false -no-color > plan.log 2>&1`;
  - `terraform show -json tfplan > plan.json` and `node scripts/plan-summary.mjs plan.json > summary.md`;
  - for `apply`: `apply -input=false tfplan > apply.log 2>&1`;
  - on error: `grep -A20 '^Error:'` of the log (masked by Actions), then exit 1;
  - `plan.json`, the logs and `tfplan` are never uploaded.
- [ ] `infra.yml`:
  - Job `plan`: on `pull_request` with paths `infra/terraform/envs/dev/**`, `infra/terraform/modules/**` and `scripts/**`; `if` the PR is from this repository; `permissions: id-token: write, contents: read, pull-requests: write`; `azure/login` with `AZURE_CLIENT_ID_PLAN`; `terraform-ci.sh plan`; post or update the comment marked `<!-- terraform-plan -->` with `actions/github-script`, from `summary.md`.
  - Job `apply`: on `push` to `main` (same paths) or `workflow_dispatch`; `environment: dev`; login with `AZURE_CLIENT_ID_APPLY`; `terraform-ci.sh apply`; `summary.md` appended to `$GITHUB_STEP_SUMMARY`.
- [ ] `deploy.yml`:
  - Triggers: `push` to `main` with paths `apps/knowledge-api/**`, `packages/**`, `prompts/**`, plus `workflow_dispatch`.
  - `environment: dev`; `npm ci`; `npm run package -w @kb/knowledge-api`; `azure/login` with the apply identity; `Azure/functions-action` with `app-name: ${{ secrets.FUNCTION_APP_NAME }}`, `package: apps/knowledge-api/deploy`, `sku: flexconsumption`.
  - Smoke test: `curl -s -o /dev/null -w '%{http_code}' -X POST https://$APP.azurewebsites.net/api/ask` equals `401`, retried 5 times, 20 s apart.
- [ ] `actionlint` locally if available. Commit `ci: add infrastructure and deployment workflows`.

### Task 8: Go public and first pipeline runs (operator + assistant)

- [ ] Leak check (assistant):
  - tracked files and full history, scanned for every value in the git-ignored configs;
  - the images in `docs/` reviewed by eye;
  - a report in chat.
- [ ] Operator:
  - push `main`;
  - make the repository public;
  - create the environment `dev` with required reviewer = owner and deployment branch `main`;
  - add the secrets (the assistant gives the exact list, with values read from local outputs and printed to the operator's terminal only).
- [ ] Test PR (tag `phase = "4"` in `envs/dev` locals): `ci` green and a summary comment on the PR. If `plan` fails on a `list*` permission, add a custom role `kb-ci-plan-reader` in `bootstrap` with only the failing actions (operator applies) and rerun.
- [ ] Merge → `infra` apply waits for approval → owner approves → applied; a follow-up PR plan shows no changes. `deploy.yml` via dispatch → smoke 401 OK.
- [ ] Scan the logs of these runs and the PR comment for real values (`gh run view --log` and `gh api` for comments), with the same patterns as the leak check.

### Task 9: Alert test

- [ ] Operator temporarily sets the Function app setting `AZURE_OPENAI_DEPLOYMENT=missing`, which makes answered questions fail with 5xx. The assistant sends ≥ 6 authenticated questions through `npm run test:e2e` (the owner runs it).
- [ ] Within ~20 min the alert fires and the email arrives. Restore the setting with a pipeline apply (Terraform owns it), and the alert resolves on the next evaluation.
- [ ] Record the timeline in the runbook.

### Task 10: Recovery drill (DoD 4)

- [ ] Before: `npm run test:e2e` 4/4 (owner).
- [ ] Operator: `terraform destroy` in `envs/dev` (local; the purge flags remove the Key Vault and OpenAI for real).
- [ ] Recreate: `infra.yml` via `workflow_dispatch` → approve → apply. Expect the same names (suffix variables).
- [ ] Operator: `terraform apply` in `envs/dev-identity`, which replaces the certificate registration with the new certificate.
- [ ] `deploy.yml` via dispatch → smoke 401.
- [ ] Owner: `npm run test:e2e` 4/4 and `npm run eval` passing, with the **same** `.sppkg` and the same local configs.
- [ ] Record the durations and any manual step discovered in the runbook.

### Task 11: Documentation

- [ ] `docs/setup/phase-4.md`: roots and order of an empty build, state migration, CI identities, secrets list (names only), workflows, how to read the plan comment, workbook, alert, drill log, pitfalls.
- [ ] README: current phase and CI badge. PLAN: Phase 4 result.
- [ ] `npm run check`, leak check, commit `docs: complete Phase 4 runbook and README`, then merge and push with the owner's consent.
