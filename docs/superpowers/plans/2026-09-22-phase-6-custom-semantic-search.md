# Phase 6 — Custom semantic search Implementation Plan

> **For agentic workers:** executed inline in this session (the owner asked for no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add a hybrid Azure AI Search retriever with an explicit per-caller permission filter, plus prompt v2, and decide the shipped defaults from a golden-set comparison.

**Architecture:** A new `modules/search` (Free tier) and an embeddings deployment feed an index built by an operator CLI (`tools/indexer`). `AiSearchRetriever` queries it with the caller's Entra groups, resolved from their own OBO Graph token. `handleAsk` selects retriever and prompt per request, honouring `x-kb-retriever` / `x-kb-prompt` only for `Evaluator` tokens. The evaluation runner gains the same switches and a comparison renderer.

**Tech Stack:** Azure AI Search Free, `text-embedding-3-small`, `@azure/search-documents`, TypeScript strict, Vitest, Terraform, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-22-phase-6-custom-semantic-search-design.md`

## Global Constraints

- No partner identifier in any tracked file, git history, workflow log, PR comment or artifact; real values stay in git-ignored config or GitHub secrets.
- The operator runs every `terraform apply`, the indexing CLI and the GitHub approvals. The assistant may run `plan`, `validate`, `fmt`, `output`, tests and read-only Azure queries.
- Azure OpenAI chat capacity stays at 10; the embeddings deployment is new and also capacity 10.
- Logs, span attributes, metrics and reports keep carrying counts, ids, kinds and durations only — never question, document, quote or answer text.
- Group ids used in a search filter always come from the caller's token, never from request input.
- Gates and golden-set expectations are never weakened to make a configuration win.
- Repository content in English; commits carry the owner as the only author.

## Review Focus

1. A caller with no groups, or a token whose `memberOf` call fails, must never fall back to an unfiltered search (Task 3 tests).
2. `x-kb-retriever` / `x-kb-prompt` from a non-Evaluator caller must be ignored, and an unknown value from an Evaluator must be a 400 (Task 4 tests).
3. Index ids must survive Graph drive-item ids that contain characters Azure AI Search rejects (Task 2 tests).
4. A chunk whose document was deleted in SharePoint must disappear from the index on the next run (Task 2 reconciliation test).
5. The comparison renderer must not leak document text and must handle a metric that is `n/a` in one of the two reports (Task 6 tests).

---

### Task 1: Infrastructure (search service and embeddings)

**Files:** create `infra/terraform/modules/search/{main.tf,variables.tf,outputs.tf}`; modify `infra/terraform/modules/openai/{main.tf,variables.tf,outputs.tf}`, `infra/terraform/envs/dev/{main.tf,variables.tf,terraform.tfvars.example}`, `infra/terraform/modules/function-app/variables.tf` if new settings need plumbing.

**Interfaces — Produces:** module outputs `search_endpoint`, `search_service_id`, `search_service_name`; openai output `embedding_deployment_name`; `envs/dev` outputs `search_endpoint` and `search_index_name`.

- [ ] `modules/search`: `azurerm_search_service` (`sku = "free"`, `local_authentication_enabled = false`, `public_network_access_enabled = true`, system-assigned identity, tags), plus role assignments: Function principal → `Search Index Data Reader`; `var.operator_object_id` → `Search Index Data Contributor` and `Search Service Contributor`; optional `var.ci_plan_principal_id` → `Search Index Data Reader`.
- [ ] `modules/openai`: second `azurerm_cognitive_deployment` `embedding` (`text-embedding-3-small`, `GlobalStandard`, capacity from a new variable, default 10) and output.
- [ ] `envs/dev`: wire the module, add `SEARCH_ENDPOINT`, `SEARCH_INDEX_NAME` (`kb-chunks-dev`), `SEARCH_BACKEND` (`graph`) and `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` to `extra_app_settings`; add the operator role for the embeddings deployment if the existing OpenAI role does not already cover it (it does: the role is on the account).
- [ ] `terraform fmt -recursive`, `validate`, `tflint`, `checkov` (skip inline with a reason only after reading each finding), then `plan`.
- [ ] Owner applies through `infra.yml` after the branch merges, or locally for the first iteration if the pipeline path is not ready; record which. Commit `feat(infra): add Azure AI Search and an embeddings deployment`.

### Task 2: Indexing CLI (TDD)

**Files:** create `tools/indexer/{package.json,tsconfig.json,indexer.config.example.json}` and `tools/indexer/src/{index.ts,chunks.ts,chunks.test.ts,acl.ts,acl.test.ts,client.ts,reconcile.ts,reconcile.test.ts,cli.ts}`; modify root `package.json` (workspace + `index` script), `tsconfig.json`, `vitest.config.ts`, `.gitignore`.

**Interfaces — Produces:** `buildChunks(documents: IndexedDocument[]): SearchChunk[]`, `chunkId(docId: string, sectionIndex: number): string`, `aclGroupsFor(library: string, config: IndexerConfig): string[]`, `reconcile(existingIds: string[], nextIds: string[]): { upload: string[]; delete: string[] }`, `SearchChunk { id, docId, title, url, library, section, content, aclGroups, contentVector }`.

- [ ] Tests first: `chunkId` sanitizes ids (Graph ids contain `!`, `.`, `%`; the key charset is letters, digits, `_`, `-`, `=`), stays unique for two docs that sanitize to the same prefix, and is stable across runs; `buildChunks` maps sections to chunks with library and ACL groups and drops empty sections; `aclGroupsFor` throws on an unmapped library (fail closed, never index with an empty ACL); `reconcile` returns deletions for ids no longer present and uploads for new/changed ids.
- [ ] Run the tests and confirm they fail.
- [ ] Implement the modules, then the CLI: interactive sign-in as user A (`@kb/test-support`), Graph listing/download, `extractSections`, embeddings through `@azure/openai` or the existing chat-client pattern with `AzureCliCredential`, index create/update and batched upload, reconciliation, content-free summary.
- [ ] `npm run check` green. Commit `feat(indexer): add the Azure AI Search indexing CLI`.

### Task 3: `AiSearchRetriever` (TDD)

**Files:** create `packages/retrievers/src/{ai-search-retriever.ts,ai-search-retriever.test.ts,group-membership.ts,group-membership.test.ts}`; modify `packages/retrievers/src/index.ts`, `packages/retrievers/package.json`.

**Interfaces — Produces:** `createGroupMembership(options): (graphToken: string, userKey: string) => Promise<string[]>`; `AiSearchRetriever implements Retriever` with `new AiSearchRetriever({ endpoint, indexName, credential, embed, groupsFor, limits })`.

- [ ] Tests first (fake `fetch`): group resolution requests `/me/memberOf?$select=id`, follows `@odata.nextLink`, returns ids only, caches per user key and fails with `UpstreamError("upstream")` on a Graph failure; the retriever sends a hybrid query (search text plus `vectorQueries`), builds the filter `aclGroups/any(g: search.in(g, 'id1,id2'))` from the resolved groups, never from input; an empty group list yields an empty result **without** querying; results map to `Chunk` and `RetrievedDocument` with rank by best score per document; search or embedding failure maps to `UpstreamError`.
- [ ] Run the tests and confirm they fail.
- [ ] Implement both modules; keep the public surface identical to `GraphSearchRetriever` so `handleAsk` stays retriever-agnostic.
- [ ] `npm run check` green. Commit `feat(retrievers): add the Azure AI Search retriever with a per-caller permission filter`.

### Task 4: Per-request retriever and prompt selection (TDD)

**Files:** modify `apps/knowledge-api/src/ask/handle-ask.ts`, `apps/knowledge-api/src/functions/ask.ts`, `apps/knowledge-api/src/config.ts`, `packages/core/src/model.ts` (diagnostics fields), `apps/spfx-assistant/src/contract.ts` and `apps/knowledge-api/contract-check.ts` if the response contract changes; tests in `apps/knowledge-api/src/ask/handle-ask.test.ts` and `config.test.ts`.

**Interfaces — Produces:** `AskDependencies.retrievers: Record<"graph" | "aisearch", Retriever>`, `AskDependencies.providers: Record<"v1" | "v2", LlmProvider>`, `AskHttpRequest.headers: Record<string, string | undefined>`; `Diagnostics.retriever` and `Diagnostics.promptVersion` reflect the selection.

- [ ] Tests first: default selection uses the configured backend and `v1`; an `Evaluator` token with `x-kb-retriever: aisearch` uses that retriever; the same header without the role is ignored; an unknown value returns 400 `invalid-request` for an Evaluator; the selection appears in the `ask.completed` log, the `ask` span and `diagnostics`.
- [ ] Run the tests and confirm they fail.
- [ ] Implement; `functions/ask.ts` builds both retrievers and both providers and passes the request headers.
- [ ] `npm run check` green; `npm run package -w @kb/knowledge-api` still bundles. Commit `feat(knowledge-api): select retriever and prompt per request for evaluators`.

### Task 5: Prompt v2

**Files:** create `prompts/v2.md`; modify `apps/knowledge-api/src/functions/ask.ts` (load both prompts).

- [ ] Write v2: every v1 rule, plus explicit instructions that a refusal is only correct when the excerpts do not answer the question, that a partially supported answer must be given with the supported part and its citation, and the unchanged refusal sentence and citation format.
- [ ] Mock-based test that the provider records `promptVersion: "v2"` when the v2 provider is used.
- [ ] Commit `feat(prompts): add prompt v2 with explicit partial-answer rules`.

### Task 6: Evaluation switches and comparison (TDD)

**Files:** modify `eval/src/{cli.ts,clients.ts,run.ts,report.ts,metrics.ts}`; create `eval/src/compare.ts` and `eval/src/compare.test.ts`; modify root `package.json` (`eval:compare`).

**Interfaces — Produces:** `createApiClient(config, tokens, options?: { retriever?: Retriever; prompt?: PromptVersion })` sending the headers; `renderComparison(a: ReportJson, b: ReportJson): string`.

- [ ] Tests first for `renderComparison`: metric table with both values and the delta, gates per configuration, per-case differences (pass→fail and fail→pass), `n/a` handling, and no document text in the output.
- [ ] Run the tests and confirm they fail.
- [ ] Implement; `--retriever`/`--prompt` flags flow into the client headers and the report meta and file name (`<date>-<retriever>-<prompt>.{md,json}`).
- [ ] `npm run check` green; `npm run eval:mock` still passes. Commit `feat(eval): compare retrievers and prompt versions`.

### Task 7: Deploy, index and measure (owner + assistant)

- [ ] Owner merges the branch so `infra.yml` applies the search service, then approves `deploy.yml`.
- [ ] Owner fills `tools/indexer/indexer.config.json` from the example and runs `npm run index`; the assistant reviews the summary.
- [ ] Assistant runs `npm run test:e2e` (graph) and an `aisearch` variant of the no-leak test to prove the filter with real users.
- [ ] Assistant runs the four evaluations (graph/v1, aisearch/v1, graph/v2, aisearch/v2) and `npm run eval:compare` on the two decisive pairs.
- [ ] Analyse: fix real defects with tests; never adjust the golden set to favour a configuration.

### Task 8: Decide, document and finish

- [ ] Choose the default retriever and prompt from the evidence; change `SEARCH_BACKEND`/prompt default only if the measurement supports it, through the pipeline.
- [ ] Commit the reports and the comparison; update README (comparison table and default), `docs/architecture.md` (new container and flow), `docs/security.md` (index ACL filter as a new control and residual risk), `docs/runbook.md` (indexing and re-indexing), `docs/certifications.md`, `docs/setup/phase-6.md` (new runbook), `docs/PLAN.md` (result), and add ADR-012 (AI Search retriever) and ADR-013 (prompt v2).
- [ ] Leak check over tracked files, history and any new report; `npm run check`; then merge and push with the owner's consent.
