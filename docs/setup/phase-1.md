# Phase 1 — End-to-end skeleton: runbook

Definition of done: see the spec, section 5.

## Checklist

| #   | Item                                             | Where        | Status |
| --- | ------------------------------------------------ | ------------ | ------ |
| 1   | Azure Functions Core Tools installed             | Local        | ✅     |
| 2   | Function App provisioned (`envs/dev`)            | Subscription | ✅     |
| 3   | API deployed, `401` without / with foreign token | Azure        | ✅     |
| 4   | SPFx package built                               | Local        | ✅     |
| 5   | Package uploaded, API access approved            | SharePoint   | ✅     |
| 6   | App added to the demo site only                  | SharePoint   | ✅     |
| 7   | Acceptance tests with users A and B              | SharePoint   | ✅     |

## Provision

Terraform binary used on Windows:

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
```

Read outputs from the `dev` environment (read-only, safe to run at any time):

```powershell
& $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
& $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_url
```

The partner tenant id used for token issuance is stored in the git-ignored
`infra/terraform/envs/dev/terraform.tfvars` (`tenant_id`).

## Deploy the API

Build the deploy bundle (bundles the `@kb/*` workspace packages into a single
`main.cjs` since `func azure functionapp publish` cannot follow workspace
symlinks):

```powershell
npm run package -w @kb/knowledge-api
```

Publish with Azure Functions Core Tools. If `func` is not on `PATH`, call it
by its full path (e.g. `C:\Program Files\Microsoft\Azure Functions Core
Tools\func.exe`):

```powershell
$name = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
cd apps/knowledge-api/deploy
func azure functionapp publish $name
cd ../../..
```

Note: `func azure functionapp publish` needs to detect the project language.
Because the deploy bundle uses the Node.js v4 programming model (no
`function.json` files), the CLI may fail with `Can't determine project
language from files.` To fix this, add a temporary `local.settings.json` next
to `host.json` in `deploy/` before publishing:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```

This file is only used by the CLI for local detection; it is not required by
the deployed app (all required settings are Terraform-managed on the Function
App resource itself).

## Build the SPFx package

From `apps/spfx-assistant`:

```powershell
npm run elements
npm run build
```

`npm run build` runs `heft test --clean --production` followed by
`heft package-solution --production` and produces
`sharepoint/solution/spfx-assistant.sppkg` (confirmed non-empty, ~38 KB). There
is no separate packaging script; `npm run elements` then `npm run build` is
the whole flow.

## Install on the demo site

Upload (partner admin account, manual): tenant App Catalog site → **Apps for
SharePoint** → upload `apps/spfx-assistant/sharepoint/solution/spfx-assistant.sppkg`
→ in the dialog do **not** tick "Make this solution available to all sites" →
**Deploy**. After upload, the list showed `Valid app package = Yes`,
`Deployed = Yes`, `Added to all sites = No`, and no errors.

Approve API access (manual): SharePoint Admin Center → **Advanced → API
access** → pending request `kb-knowledge-api-dev` / `user_impersonation` →
**Approve**. Grants the "SharePoint Online Client Extensibility Web
Application Principal" the delegated scope.

Add the app to the demo site only: on `/sites/kb-demo`, the assistant does
**not** show up in the page's web part picker — it is an extension, not a web
part. Add it via **Site settings ⚙️ → Add an app** (or **Site contents → New
→ App**) → **From your organization** → `spfx-assistant-client-side-solution`.
Do this only on the demo site.

## Verify

`401` without a token:

```powershell
$url = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_url
curl.exe -i -X POST "$url/api/ask" -H "Content-Type: application/json" -d "{}"
```

Expected: `HTTP/1.1 401` with body `{"error":"unauthorized","correlationId":"…"}`.

`401` with a token for another audience (Microsoft Graph), to confirm audience
validation rejects tokens not issued for this API:

```powershell
$tid = "<tenant-id>"
$graph = az account get-access-token --tenant $tid --resource-type ms-graph --query accessToken -o tsv
curl.exe -i -X POST "$url/api/ask" -H "Content-Type: application/json" -H "Authorization: Bearer $graph" -d "{}"
```

Expected: `HTTP/1.1 401`.

Acceptance tests on `/sites/kb-demo` (all passed):

| Check                                                                | Result                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| User A opens `kb-demo` home page, clicks the button, asks a question | Mock answer with A's display name, the page title "kb-demo – Organization home" and the "Resposta de teste" badge |
| User B (private window) does the same                                | Mock answer with B's display name                                                                                 |
| `curl` without token                                                 | `401`                                                                                                             |
| `curl` with a Microsoft Graph token                                  | `401`                                                                                                             |
| A opens a partner department site                                    | No assistant button                                                                                               |
| Keyboard only: Tab to button, Enter, type, Enter, Esc                | Panel opens, answers, closes; focus returns to the button                                                         |

Feedback captured for later: the launcher icon looks small and plain
(follow-up UI polish, not part of this phase).

## Pitfalls

- `func azure functionapp publish` cannot follow the workspace symlinks
  under `node_modules/@kb/*`; always publish the bundled `deploy/` output
  produced by `npm run package -w @kb/knowledge-api`, not the source tree.
- Without any `function.json` files (Node.js v4 programming model), `func`
  cannot infer the project language from the `deploy/` folder alone; add a
  temporary `local.settings.json` with `FUNCTIONS_WORKER_RUNTIME: node` so
  the CLI can detect it before publishing.
- After a successful deploy, `func` may report the app as "unhealthy" via its
  own health probe immediately after publish. This does not necessarily mean
  the app is broken — verify with an actual HTTP request against `/api/ask`
  before assuming a real failure.
- `func azure functionapp logstream` is **not supported** on Flex Consumption
  (or Linux Consumption) plans. Use Application Insights (Live Metrics /
  transaction search) instead when you need request-level diagnostics such as
  the specific unauthorized reason (e.g. `invalid-token`) for a `401`.
- The Flex Consumption Function App has both a platform-created
  `AzureWebJobsStorage` app setting (empty key, managed identity based) and
  `AzureWebJobsStorage__accountName`. Do not remove or hand-edit either;
  storage app settings are Terraform-managed.
- The assistant is an application customizer extension, not a web part: it
  never appears in the page's web part picker. Add it from **Site settings
  ⚙️ → Add an app** (or **Site contents → New → App**), not from the page
  editing toolbar.
- If the panel shows "Assistente não configurado neste site.", the API
  access request was not approved yet, or the approval is still propagating
  (can take several minutes).
- If the browser console shows a CORS error, verify `sharepoint_origin` in
  `terraform.tfvars` exactly matches the page origin and re-plan/apply.
