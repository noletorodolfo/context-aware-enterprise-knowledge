# Operations runbook

This document is the public operational index. It deliberately names no live tenant, subscription,
host or identity value. Detailed, phase-specific commands and evidence remain in the linked runbooks.

## Operator responsibilities

| Activity                                          | Owner                                               | Boundary                                               |
| ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| SharePoint package upload and API access approval | Microsoft 365 operator                              | Partner tenant, manual                                 |
| Partner identity Terraform root                   | Microsoft 365 operator                              | Local machine only                                     |
| Azure bootstrap Terraform root                    | Azure subscription owner                            | Local machine only                                     |
| Azure runtime Terraform root                      | GitHub Actions after protected-environment approval | Azure subscription only                                |
| API deployment                                    | GitHub Actions after protected-environment approval | Azure subscription only                                |
| E2E and real evaluation                           | Operator                                            | Interactive test users and ignored local configuration |

## Configure a development environment

1. Install Node 22, Terraform and the Azure CLI.
2. Copy the Terraform `*.tfvars.example` files to ignored local `terraform.tfvars` files and fill
   them with live values. Create ignored backend configuration files for each Terraform root.
3. Copy `apps/knowledge-api/e2e/e2e.config.example.json`, `eval/eval.config.example.json` and
   `tools/indexer/indexer.config.example.json` to their ignored local counterparts. In the indexer
   configuration, every library key must match the SharePoint document library name exactly,
   accents included (`Políticas`, not `Politicas`), or indexing stops with "library was not found".
4. Install dependencies and run the safe checks:

```bash
npm install
npm --prefix apps/spfx-assistant install
npm run check
npm run eval:mock
```

The exact initial provisioning order is documented in [Phase 0](setup/phase-0.md), [Phase 2](setup/phase-2.md)
and [Phase 4](setup/phase-4.md). Do not place live configuration in issues, pull requests or tracked files.

## Deploy and verify

The public repository uses three workflows:

| Workflow             | Trigger                                               | Result                                                                       |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ci.yml`             | Pull request and `main`                               | checks, mock evaluation, SPFx package build and Terraform static validation  |
| `infra.yml`          | Azure-runtime Terraform changes or dispatch           | value-free PR plan; protected approved apply                                 |
| `deploy.yml`         | API/package/prompt change or dispatch                 | protected API package deployment and unauthenticated 401 smoke test          |
| `deploy-indexer.yml` | Ingestion app, package or contract change or dispatch | protected ingestion deployment and a webhook validation-handshake smoke test |

The actual SharePoint package is built locally using its ignored API configuration and uploaded by the
operator. That keeps the live Entra app identifier out of public CI artifacts.

`infra.yml` reads its variables from the `TF_VARS_DEV` repository secret, which is a copy of the local
`terraform.tfvars`. Changing that file locally does not change what the pipeline plans: update the
secret in the same change, or the run fails on a missing variable. Keep `name_suffixes` on a single
line, since the masking step redacts every quoted value and a multi-line map becomes unreadable.

After a deployment:

```bash
npm run index                                     # only when the corpus or the retriever changed
npm run test:e2e
npm run eval -- --retriever graph --prompt v1
```

`test:e2e` proves the permission boundary with two interactive accounts, under both retrievers. `eval`
runs 30 cases and produces a report named after the date and the variant. `npm run index` rebuilds
the Azure AI Search index and deletes chunks whose document disappeared; it is required after any
change to chunking, embeddings or stored fields, because existing chunks keep their old shape. See
[Phase 2](setup/phase-2.md), [Phase 3](setup/phase-3.md) and [Phase 6](setup/phase-6.md) for failure
behavior, retry notes and interpretation.

## Observe and troubleshoot

The Application Insights workbook contains request volume, p50/p95 latency, Graph and model dependency
latency, refusal rates and upstream failures. The error-rate alert evaluates 5xx responses over a
15-minute window once at least five requests exist.

Error messages in the panel end with a trace code. Query the Log Analytics API with that code to follow the request,
OBO, retrieval and model spans. The exact KQL and REST command are in
[Phase 3: Follow one question as a single trace](setup/phase-3.md#follow-one-question-as-a-single-trace).

For availability incidents:

1. Check the workbook and alert history before changing configuration.
2. Match a trace code to its content-free `ask.upstream-failed` dimensions.
3. Treat model content-filter outcomes as a safe refusal, not as an invitation to log prompt content.
   The `ask.completed` line names the categories that fired (`filteredCategories`), which is enough to
   tell a prompt-shield block on retrieved content from a quality problem, without any prompt text.
4. Restore Terraform-owned drift through an approved `infra.yml` run rather than by retaining manual
   configuration edits.

## Operate the ingestion path

Ingestion needs no command in normal operation: a SharePoint change becomes a queue message and the
consumer applies it. What an operator does is check it and, rarely, rebuild.

```bash
npm run reindex      # full rebuild from SharePoint, then clear the delta cursors
npm run index        # the same rebuild, leaving the cursors alone
```

| Symptom                                | First check                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| A document changed but answers did not | `ingestion.notified` then `ingestion.processed` for that library              |
| Nothing arrives at all                 | `ingestion.subscriptions-reconciled`: `failures` and `live` counts            |
| Messages pile up                       | the `document-changed` queue length, then the consumer's failures in the logs |
| A message keeps failing                | `document-changed-poison`: read the event, fix the cause, then delete it      |
| The index disagrees with SharePoint    | `npm run reindex`, which reports what it deleted                              |

A lapsed subscription costs freshness, not correctness: the renewal run recreates it and the next
delta query reports what changed meanwhile. Changing the libraries or their groups means changing
`ingestion_library_acl` in the Terraform variables **and** the `TF_VARS_DEV` secret, then applying;
the renewal run then creates or deletes subscriptions to match.

## Recover the Azure runtime

The Azure runtime and partner identity have distinct state. A full rebuild uses this order:

1. Run the partner identity root once to establish the app and groups.
2. Run the Azure runtime root through the approved infrastructure workflow.
3. Run the partner identity root again to register the freshly created OBO certificate.
4. Dispatch and approve API deployment.
5. Run E2E and real evaluation with the unchanged SharePoint package.

This process was proven in a destroy-and-recreate drill. The timing, the required Key Vault role
propagation pause and the Application Insights Smart Detection pitfall are recorded in
[Phase 4](setup/phase-4.md#recovery-drill).

## Rotate and revoke

- The OBO certificate is non-exportable and renews through Key Vault policy. After renewal, run an
  approved `infra.yml` apply first, so the Azure root publishes the new certificate output, then
  apply the partner identity root so the application registration receives the current public
  certificate.
- If a token cache is no longer appropriate, delete the ignored local token-cache files and sign in
  again. Never commit them.
- If any live value reaches a public location, follow the disclosure procedure in
  [security.md](security.md#incident-and-disclosure-rules) immediately.

## Related detailed runbooks

- [Phase 0 - Foundation](setup/phase-0.md)
- [Phase 1 - End-to-end skeleton](setup/phase-1.md)
- [Phase 2 - Permission-aware retrieval](setup/phase-2.md)
- [Phase 3 - Governance and quality](setup/phase-3.md)
- [Phase 4 - Infrastructure and CI/CD](setup/phase-4.md)
- [Phase 5 - Documentation and demo](setup/phase-5.md)
