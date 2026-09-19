# Phase 4 — Infrastructure and CI/CD: runbook

Definition of done: see the spec (`docs/superpowers/specs/2026-09-18-phase-4-infrastructure-and-ci-cd-design.md`).

## Checklist

| #   | Item                                                                   | Where  | Status |
| --- | ---------------------------------------------------------------------- | ------ | ------ |
| 1   | Terraform split: `envs/dev` (Azure) and `envs/dev-identity` (partner)  | Local  | ✅     |
| 2   | CI identities with GitHub OIDC (plan, apply)                           | Azure  | ✅     |
| 3   | `ci.yml` green on pull requests                                        | GitHub | ✅     |
| 4   | `infra.yml`: value-free plan comment on the PR, approved apply on main | GitHub | ✅     |
| 5   | `deploy.yml`: API published and smoke-tested                           | GitHub | ✅     |
| 6   | Workbook and error-rate alert                                          | Azure  | ✅     |
| 7   | Alert fired on a controlled error burst                                | Azure  | ✅     |
| 8   | Recovery drill: destroy, pipeline recreate, E2E and eval passing       | Azure  | ✅     |
| 9   | Repository public, leak check clean                                    | GitHub | ✅     |

## Layout

| Root                                | Tenant / subscription | Applied by                   | State key              |
| ----------------------------------- | --------------------- | ---------------------------- | ---------------------- |
| `infra/terraform/bootstrap`         | personal              | operator, local              | local file             |
| `infra/terraform/envs/dev`          | personal              | `infra.yml` (owner approves) | `dev.tfstate`          |
| `infra/terraform/envs/dev-identity` | partner               | operator, local              | `dev-identity.tfstate` |

GitHub never holds a credential in the partner tenant. `envs/dev` reads the API client ID from the
identity state, and `envs/dev-identity` reads the OBO certificate's public data from the Azure state,
both with `terraform_remote_state`.

Building an empty environment takes three steps:

1. `envs/dev-identity` apply, which fails at the certificate registration with "Apply envs/dev first"
   until the Azure root exists. Everything else is created.
2. `envs/dev` apply, through `infra.yml` or locally.
3. `envs/dev-identity` apply again, which registers the certificate.

## CI identities

`bootstrap` creates two user-assigned managed identities in `rg-kb-ci`, with GitHub federated credentials:

| Identity         | Subject (GitHub OIDC)                           | Roles                                                                                                              |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id-kb-ci-plan`  | `repo:<owner>@<id>/<repo>@<id>:pull_request`    | Reader and `kb-ci-plan-reader` (three list reads) on the subscription, state blob data, Key Vault Certificate User |
| `id-kb-ci-apply` | `repo:<owner>@<id>/<repo>@<id>:environment:dev` | Contributor and User Access Administrator on the subscription, state blob data, Key Vault Certificates Officer     |

GitHub now puts the immutable owner and repository IDs in the token subject. The IDs are public and
are the default of the `github_repository` variable.

`kb-ci-plan-reader` exists because Reader cannot call the POST "list" actions the azurerm provider uses
to refresh state. They were found with `TF_LOG=DEBUG` on a local plan:
`Microsoft.Web/sites/config/list/action`, `Microsoft.Storage/storageAccounts/listKeys/action` and
`Microsoft.OperationalInsights/workspaces/sharedKeys/action`.

## GitHub settings

- Repository: public (environments with required reviewers are free only on public repositories).
- Environment `dev`: required reviewer = owner, deployment branch `main` only.
- Repository secrets (not environment secrets, or the pull request plan cannot read them):

| Secret                  | Content                                 |
| ----------------------- | --------------------------------------- |
| `AZURE_TENANT_ID`       | personal tenant                         |
| `AZURE_SUBSCRIPTION_ID` | personal subscription                   |
| `AZURE_CLIENT_ID_PLAN`  | `bootstrap` output `ci_plan_client_id`  |
| `AZURE_CLIENT_ID_APPLY` | `bootstrap` output `ci_apply_client_id` |
| `FUNCTION_APP_NAME`     | `envs/dev` output `function_app_name`   |
| `TF_VARS_DEV`           | the whole `envs/dev/terraform.tfvars`   |
| `TF_BACKEND_DEV`        | the whole `envs/dev/backend.hcl`        |

Keep every line of `TF_VARS_DEV` meaningful (for example `name_suffixes = { ... }` on one line):
GitHub masks multi-line secrets line by line, so a line holding only `}` masks every `}` in the logs.

## Workflows

| Workflow     | Trigger                                                     | What it does                                                                                                      |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ci.yml`     | every pull request, push to `main`                          | `npm run check`, `npm run eval:mock`, SPFx build with the example config, Terraform fmt/validate, tflint, checkov |
| `infra.yml`  | PR or push touching `envs/dev`, modules, CI scripts; manual | PR: plan with `id-kb-ci-plan`, summary comment. Main/manual: `dev` approval, plan + apply with `id-kb-ci-apply`   |
| `deploy.yml` | push touching the API, packages or prompts; manual          | `dev` approval, package, publish to Flex Consumption, smoke test (401 without a token)                            |

`scripts/terraform-ci.sh` masks every quoted value of the two tfvars/backend secrets and every
output of the identity state before Terraform runs. Terraform output goes to files; on failure only
the `Error:` blocks are printed. `scripts/plan-summary.mjs` turns `terraform show -json` into a table
of resource addresses and actions, with `for_each` keys hidden and no attribute values.

The apply job has no separate preview: the owner approves after reading the pull request's plan
comment, and the job summary lists what was applied.

## Workbook and alert

- Workbook "Knowledge API (dev)" in `rg-kb-dev`: questions per hour by status class, p50/p95 latency,
  p95 of `llm.generate` and `graph.search`, answers vs. refusals by reason, and failures by kind
  (Azure OpenAI throttling shows as `llm-unavailable`/429).
- Alert `alert-kb-dev-error-rate`: 5xx share of `POST api/ask` above 5% in a 15-minute window with at
  least 5 requests, evaluated every 15 minutes, emailing the owner through `ag-kb-dev`. About USD 0.50/month.

### Alert test (2026-09-19)

1. The Function's `AZURE_OPENAI_DEPLOYMENT` was set to a missing deployment by hand, so answered
   questions fail with 503.
2. First attempt: two E2E runs, 4 errors each, 10 minutes apart. The alert did **not** fire. Each
   15-minute evaluation window saw only 4 requests, below the 5-request minimum. The rule was right and
   the test was wrong.
3. Second attempt: three E2E runs within 11 seconds (12 errors at 11:33 UTC). The alert fired at
   11:45 UTC (Azure Monitor alert history), notifying the owner through the action group.
4. The first test also proved drift correction: a manual `infra.yml` run put the setting back.

## Recovery drill

### Log (2026-09-19)

| Step                                                | Who                       | Result                                                                   |
| --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Baseline `npm run test:e2e`                         | assistant (cached tokens) | 4/4                                                                      |
| `terraform destroy` of `envs/dev`                   | operator, local           | 21 of 22 destroyed; see the pitfall about the Smart Detection group      |
| Delete the auto-created action group, destroy again | assistant, then operator  | resource group gone                                                      |
| `infra.yml` via manual dispatch, approved           | pipeline                  | recreated in about 8 minutes, including the 120 s role pause; same names |
| `envs/dev` plan                                     | assistant                 | no changes                                                               |
| `envs/dev-identity` apply                           | operator, local           | certificate registration replaced (1 added, 1 destroyed)                 |
| `deploy.yml` via manual dispatch, approved          | pipeline                  | published, smoke test 401                                                |
| `npm run test:e2e`                                  | assistant                 | 4/4, with the same `.sppkg`                                              |
| `npm run eval`                                      | assistant                 | gates pass, every target met (`eval/reports/2026-09-19.md`)              |

Names came back identical (fixed suffixes), so the SharePoint package, the E2E config and the eval
config worked unchanged. Two answerable cases were refused with the right document ranked first
(citations 23/25, still above the 90% target). They passed in the first report, so this is model
variance, not an effect of the drill. It is a candidate for prompt v2.

## Migration log (2026-09-18)

1. `envs/dev` published the certificate and monitoring outputs (outputs only).
2. The operator ran a script that pulled `dev.tfstate`, moved `module.identity` and
   `azuread_application_certificate.knowledge_api_obo` into a new local state with `terraform state mv`,
   and pushed both states. No `import` blocks, so no partner IDs in tracked files.
3. `envs/dev-identity` apply: outputs only. `envs/dev` apply: the three `random_string` suffixes left the
   state ("no longer managed"), 2 Key Vault role assignments for the CI identities were created, 0 destroyed.
4. Both follow-up plans: no changes.

## Pitfalls

- The checkov GitHub action pulled an old checkov image with different rules; CI installs a pinned
  checkov with pipx instead.
- Secrets created as environment secrets are invisible to the pull request plan job.
- A new federated credential subject must include the immutable IDs (`owner@id/repo@id`).
- `terraform init -upgrade` also bumps existing providers; to add a provider only, restore the lock file
  and run a plain `init`.
- Recreating a Key Vault and its certificate in one apply needs the role propagation pause
  (`time_sleep.certificate_roles_propagation`, 120 s).
- Application Insights creates an "Application Insights Smart Detection" action group that Terraform
  does not manage, so the first destroy stopped at the resource group. `envs/dev` now sets
  `prevent_deletion_if_contains_resources = false`: the group belongs to this project only.
- An alert test must put at least 5 requests in the same 15-minute window; spread-out batches can miss
  every window.
- After the history rewrite, the local `main` lost its upstream: `git branch --set-upstream-to=origin/main main`.
- In Git Bash, `az ... --ids /subscriptions/...` needs `MSYS_NO_PATHCONV=1`, or the ID becomes a Windows path.
