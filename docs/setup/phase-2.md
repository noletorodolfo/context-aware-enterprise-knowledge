# Phase 2 — Permission-aware retrieval: runbook

Definition of done: see the spec, section 7.

## Checklist

| #   | Item                                                          | Where      | Status                                                                                             |
| --- | ------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| 1   | Key Vault certificate, Azure OpenAI, E2E client, budget USD 5 | Terraform  | ✅                                                                                                 |
| 2   | API deployed with retrieval and Azure OpenAI                  | Azure      | ✅                                                                                                 |
| 3   | SPFx package with citations uploaded                          | SharePoint | ✅                                                                                                 |
| 4   | End-to-end no-leak test green                                 | Local      | ✅                                                                                                 |
| 5   | A and B compared on the demo site (screenshots)               | SharePoint | ✅ (manual comparison recorded below; anonymized screenshots pending (optional per user decision)) |

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

Before the first `apply` in a subscription that has never used Azure OpenAI,
two resource providers must be registered and quota must be checked:

```powershell
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.CognitiveServices
az cognitiveservices usage list --location eastus2 -o table
```

In this subscription the quota name for the target model comes back without
a dash (`gpt4.1-mini`, not `gpt-4.1-mini`); use the exact name reported by
`usage list` when sizing the Terraform deployment capacity, not the model's
marketing name. The deployment used here is `gpt-4.1-mini` (version
`2025-04-14`), SKU `GlobalStandard`, capacity `10` (thousand TPM), account
region `eastus2`. The budget was raised to USD 5 via the bootstrap tfvars
plus a saved plan.

The Claude Code session used to prepare this phase blocks `terraform apply`
directly; the saved plans were reviewed and applied by the human operator.
A follow-up `terraform plan` after each apply showed no further changes.

**Role propagation pitfall:** RBAC role assignments created by `apply`
(Key Vault Crypto User on the certificate key, Cognitive Services OpenAI
User) can take a few minutes to propagate. Callers see a `502`/`503`
(upstream failure), not a `403`, on the Key Vault or Azure OpenAI call
right after a fresh `apply`. Wait a few minutes and retry before assuming
the assignment is wrong.

Read outputs from the `dev` environment (read-only, safe to run at any time):

```powershell
& $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
& $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_url
& $tf "-chdir=infra/terraform/envs/dev" output -raw e2e_client_id
& $tf "-chdir=infra/terraform/envs/dev" output -raw knowledge_api_identifier_uri
```

The Function App already carries the Phase 2 app settings (`TENANT_ID`,
`API_CLIENT_ID`, `SEARCH_SITE_URLS`, `KEY_VAULT_KEY_ID`,
`OBO_CERT_THUMBPRINT`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`) and
role assignments (Key Vault Crypto User on the certificate key, Cognitive
Services OpenAI User) applied by Terraform in Task 1 of this phase.

## Deploy the API

Build the deploy bundle. `npm run package` first runs `tsc -b` for the whole
repo project graph (so `@kb/core`, `@kb/retrievers` and `@kb/llm-providers` have a `dist/` to
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

`func` may print that the app "appears to be unhealthy" right after
publishing, and the Kudu deployment log may report "Function triggers
synchronization failed ... 500". Both are benign for HTTP-triggered
functions on this plan; do not treat either message alone as a failed
deploy. Verify instead with the `401` smoke test in **Verify** below and by
checking that the active deployment's timestamp in Kudu/the portal matches
the publish you just ran.

## Build and upload SPFx 1.0.2.0

The SPFx package was bumped to version `1.0.2.0` for Phase 2 to carry the
citation and refusal UI:

- **Citations ("Fontes")**: the answer panel lists the retrieved documents
  as a "Fontes" section, each entry linking to the source document and
  showing the quoted excerpt used to ground the answer.
- **Refusal badge**: when the orchestrator has no grounded answer, the UI
  shows a "Sem resposta nos documentos" badge instead of a fabricated
  answer.
- **Consent/config error mapping**: a `403` from the API is shown to the
  user as "Assistente não configurado neste site." instead of a generic
  error, since it most commonly means OBO consent or site configuration is
  missing for that site.

Build the package the same way as Phase 1 (see `apps/spfx-assistant`), then
upload the new `.sppkg` to the tenant App Catalog, **replacing** the
existing package rather than deploying it tenant-wide. After the upload,
open the demo site and update the app there (Site Contents → the app tile →
"Get it") so the site picks up the new package version.

## End-to-end test

Copy the example config and fill it in with real values (this file is
git-ignored, never commit it):

```powershell
cp apps/knowledge-api/e2e/e2e.config.example.json apps/knowledge-api/e2e/e2e.config.json
```

Fields in `e2e.config.json`:

| Field        | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| `tenantId`   | Entra ID tenant id                                                      |
| `clientId`   | E2E test client app id, Terraform output `e2e_client_id`                |
| `apiScope`   | Terraform output `knowledge_api_identifier_uri` + `/user_impersonation` |
| `apiBaseUrl` | Terraform output `function_app_url`                                     |
| `siteUrl`    | Demo SharePoint site URL                                                |
| `userA`      | Test user A's UPN (has access to the restricted library)                |
| `userB`      | Test user B's UPN (does not have access to the restricted library)      |

Run the suite:

```bash
npm run test:e2e
```

The first run opens an interactive browser sign-in **twice**: once for
`userA`, once for `userB`. Later runs reuse the git-ignored token caches
written on first sign-in, so they run unattended until a token expires.

The `.token-cache-*.json` files hold refresh tokens (git-ignored); delete
them to force an interactive re-sign-in.

**Final result: 4/4 tests passed.**

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

### Manual verification: A vs B on the demo site

Same question asked by both test users on the demo site, through the SPFx
assistant:

| Question                                                   | User A                                             | User B                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| "Qual o valor do auxílio home office?"                     | R$ 150,00, citing `politica-home-office`           | R$ 150,00, citing `politica-home-office` (same answer, shared library) |
| "Qual a faixa salarial de um Analista de Logística Pleno?" | Salary range answer, citing `tabela-salarial-2026` | Refusal ("Sem resposta nos documentos") — no access to that library    |

This confirms permission-aware retrieval: the same question against a
shared document returns the same answer for both users, while a question
whose only source is a restricted document is answered for the user who has
access and refused for the one who does not.

Note the assistant only answers about the _content_ of documents it
retrieves; a meta-question such as "which documents are in library X" is
refused by design, since retrieval is content-based, not a directory
listing.

## Debugging note: a content-filter refusal, not a leak

During manual verification, user B's salary question initially returned a
`503` instead of a clean refusal. Content-free upstream error details were
added to the observability logs (`ask.upstream-failed`, logging only
`status`/`code`/`innerCode`, never prompt or answer content) and showed an
Azure OpenAI `400 content_filter` response, `param: prompt`,
`innerCode: ResponsibleAIPolicyViolation`.

Root cause: without access to the salary table, user B's retrieval fell
back to a synthetic supplier FAQ section that intentionally contains a
planted prompt-injection paragraph (part of the evaluation set). Azure
OpenAI's content filter (likely Prompt Shields jailbreak detection) blocked
the completion call outright before any answer could be generated.

Fix: a new error kind `llm-content-filtered` is now mapped to a safe
refusal (HTTP `200`, `refused: true`) instead of surfacing the upstream
`503`, with a log field `refusalReason: "content-filter"`. The other
refusal reasons logged the same way are `no-relevant-documents` and
`ungrounded`.

This is defense in depth, not a single control: permission trimming via
Graph Search with the user's own token, delimited/untrusted-content framing
in prompt v1, Azure's content filter, and citation grounding all have to be
bypassed together for a leak or a fabricated answer to reach the user.

### Reading logs without extra CLI extensions

`az monitor app-insights query` needs an extension on first use; the Log
Analytics REST API avoids that:

```powershell
$workspaceId = "<log analytics workspace customerId>"
az rest --method get `
  --resource "https://api.loganalytics.io" `
  --uri "https://api.loganalytics.io/v1/workspaces/$workspaceId/query" `
  --uri-parameters "query=AppTraces | where Message has 'ask.'"
```

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
  (`401` vs `500`/`503`) plus `az functionapp show --query state`, or the
  Log Analytics REST query above, instead of deep log queries.
- **Certificate auto-renewal changes the thumbprint.** Key Vault
  auto-renews the OBO certificate 30 days before its 12-month expiry. After
  a renewal, re-run `terraform plan`/`apply` for `envs/dev` so the app
  registration credential and the `OBO_CERT_THUMBPRINT` app setting follow
  the new certificate; otherwise OBO token exchange starts failing with a
  stale-credential error.
- **OBO consent errors surface as `403`.** If admin consent for the OBO
  scope is missing or was revoked, the API returns `403`, which the SPFx UI
  now shows as "Assistente não configurado neste site."
- **Global Standard processes data outside the account region.** The
  `GlobalStandard` SKU used for the Azure OpenAI deployment may route
  requests outside the account's configured region (e.g. `eastus2`). This is
  only acceptable here because the repository uses exclusively synthetic
  documents; it would need to be revisited before using real tenant data.
- **Trial subscriptions may have zero Azure OpenAI quota.** Always confirm
  available quota with `az cognitiveservices usage list` before sizing the
  Terraform deployment capacity; a trial or newly created subscription can
  start at zero for every model.
