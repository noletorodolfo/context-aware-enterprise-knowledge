# Phase 2 — Permission-aware retrieval: runbook

Definition of done: see the spec, section 7.

## Checklist

| #   | Item                                                          | Where      | Status |
| --- | ------------------------------------------------------------- | ---------- | ------ |
| 1   | Key Vault certificate, Azure OpenAI, E2E client, budget USD 5 | Terraform  | ✅     |
| 2   | API deployed with retrieval and Azure OpenAI                  | Azure      | ✅     |
| 3   | SPFx package with citations uploaded                          | SharePoint | ⬜     |
| 4   | End-to-end no-leak test green                                 | Local      | ⬜     |
| 5   | A and B compared on the demo site (screenshots)               | SharePoint | ⬜     |

## Provision

Terraform binary used on Windows:

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
```

Phase 2 added, on top of the Phase 1 resources, a Key Vault certificate used
for the OBO (on-behalf-of) flow, an Azure OpenAI account/deployment, an
end-to-end test client app registration, and a cost budget of USD 5 for the
`dev` environment. These are provisioned and managed exclusively through
Terraform (`infra/terraform/envs/dev`); this runbook does not re-run
`plan`/`apply`, only reads outputs.

Read outputs from the `dev` environment (read-only, safe to run at any time):

```powershell
& $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
& $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_url
```

The Function App already carries the Phase 2 app settings (`TENANT_ID`,
`API_CLIENT_ID`, `SEARCH_SITE_URLS`, `KEY_VAULT_KEY_ID`,
`OBO_CERT_THUMBPRINT`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`) and
role assignments (Key Vault Crypto User on the certificate key, Cognitive
Services OpenAI User) applied by Terraform in Task 1 of this phase.

## Deploy the API

Build the deploy bundle. `npm run package` first runs `tsc -b` for the whole
repo project graph (so `@kb/core` and `@kb/llm-providers` have a `dist/` to
resolve, even on a fresh clone) and then bundles everything, including those
workspace packages, into a single `main.cjs`, since `func azure functionapp
publish` cannot follow workspace symlinks:

```powershell
npm run package -w @kb/knowledge-api
```

This also writes a `deploy/local.settings.json` with
`{"IsEncrypted": false, "Values": {"FUNCTIONS_WORKER_RUNTIME": "node"}}` so
`func` can detect the project language; no manual step is needed.

Publish with Azure Functions Core Tools. If `func` is not on `PATH`, call it
by its full path (e.g. `C:\Program Files\Microsoft\Azure Functions Core
Tools\func.exe`):

```powershell
$name = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
cd apps/knowledge-api/deploy
func azure functionapp publish $name
cd ../../..
```

This publish replaces the Phase 1 code with the Phase 2 code (OBO exchange,
Graph retrieval, Azure OpenAI answer generation) on the same Function App; no
app settings or infrastructure change.

## Verify

`401` without a token proves the app started successfully: the config loader
resolves every required setting at module import, so any missing/invalid
setting would surface as a `500`/`503` instead of a clean `401`.

```powershell
$url = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_url
curl.exe -i -X POST "$url/api/ask" -H "Content-Type: application/json" -d "{}"
```

Expected: `HTTP/1.1 401` with body `{"error":"unauthorized","correlationId":"…"}`.

If instead you get a `500`/`503` with no JSON body, check Application
Insights `traces` for a `Missing required setting` message and fix the
setting via Terraform (do not hand-edit app settings in the portal).

## Pitfalls

- `func azure functionapp publish` cannot follow the workspace symlinks
  under `node_modules/@kb/*`; always publish the bundled `deploy/` output
  produced by `npm run package -w @kb/knowledge-api`, not the source tree.
- After a successful deploy, `func`'s own post-deploy health probe may report
  the app as "unhealthy" even though the deployment pipeline completed
  cleanly. This does not necessarily mean the app is broken — verify with an
  actual HTTP request against `/api/ask` before assuming a real failure.
- `func azure functionapp logstream` is **not supported** on Flex Consumption
  (or Linux Consumption) plans. Use Application Insights (Live Metrics /
  transaction search) instead when you need request-level diagnostics.
- `az monitor app-insights query` may require installing an Azure CLI
  extension on first use; if that is not desired, rely on HTTP status codes
  (`401` vs `500`/`503`) plus `az functionapp show --query state` instead of
  deep log queries.
