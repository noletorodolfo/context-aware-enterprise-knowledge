# Phase 6 — Custom semantic search: design

- **Status:** approved in conversation (2026-09-22)
- **Scope:** `docs/PLAN.md`, section 11, Phase 6
- **Builds on:** Phases 0–5, in particular the retriever abstraction (ADR-005) and the evaluation harness
- **Goal:** add a hybrid (keyword + vector) retriever backed by Azure AI Search with an explicit
  permission filter, and measure it against the current Graph Search retriever with the existing golden
  set, so the choice of retriever and prompt rests on evidence.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                  | Why                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Azure AI Search on the **Free** tier, one index, hybrid queries (BM25 + vector, reciprocal rank fusion). Embeddings come from a `text-embedding-3-small` deployment on the existing Azure OpenAI account. | Keeps the project at zero infrastructure cost; embeddings for a small synthetic corpus cost cents per year.                                     |
| D2  | Every chunk carries `aclGroups`. Each query filters on the caller's Entra group membership, read through the caller's own OBO Graph token and cached in memory.                                           | With an own index, SharePoint no longer trims results. The filter must be explicit, per caller, and derived from the caller's token, not input. |
| D3  | Indexing is an operator CLI (`npm run index`), not an automatic pipeline. Event-driven ingestion stays Phase 7.                                                                                           | A visible, repeatable indexing step is enough to evaluate retrieval quality without building the ingestion subsystem.                           |
| D4  | The API keeps `graph` as the default retriever and `v1` as the default prompt. Callers holding the `Evaluator` app role may override both per request with `x-kb-retriever` and `x-kb-prompt`.            | One environment can be measured in both configurations, and a normal user can never influence retrieval or prompt selection.                    |
| D5  | The comparison runs the existing 30-case golden set per configuration and produces a comparison report. No golden-set case or gate is weakened to favour a configuration.                                 | The evaluation is the referee; changing it to win would destroy its value.                                                                      |
| D6  | Azure AI Search becomes the default only if it matches or beats Graph Search on the hard gates and the quality targets. Otherwise it ships as an evaluated, documented alternative.                       | Evidence decides, and a negative result is a legitimate, publishable outcome.                                                                   |

Out of scope (YAGNI): event-driven ingestion, incremental/delta indexing, semantic ranker (not on the
Free tier), multi-index routing, re-ranking models, and indexing anything other than the demo site.

## 2. Infrastructure

New `modules/search`:

- `azurerm_search_service` (`sku = "free"`, local auth disabled, system-assigned identity, public network).
- Role assignments on the service:
  - Function App managed identity → **Search Index Data Reader** (query only);
  - operator (`var.operator_object_id`) → **Search Index Data Contributor** and **Search Service Contributor** (create the index and upload documents);
  - CI plan identity → **Reader** through the existing subscription-level assignment, so `plan` refreshes.
- `modules/openai` gains a second `azurerm_cognitive_deployment` for `text-embedding-3-small`
  (`GlobalStandard`, capacity 10), exposed as an output.
- `envs/dev` wires the module and adds the Function App settings `SEARCH_ENDPOINT`,
  `SEARCH_INDEX_NAME`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` and `SEARCH_BACKEND` (default `graph`).

The index itself is created by the CLI, not by Terraform: the schema belongs with the code that writes
and queries it, and the Free tier allows recreating it cheaply.

## 3. Index schema

| Field           | Type                                              | Notes                                                      |
| --------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `id`            | `Edm.String` (key)                                | `<docId>-<sectionIndex>`, sanitized to the allowed charset |
| `docId`         | `Edm.String`, filterable                          | Graph drive item id                                        |
| `title`         | `Edm.String`, searchable                          | Document name without extension                            |
| `url`           | `Edm.String`, retrievable                         | Web URL of the document                                    |
| `library`       | `Edm.String`, filterable                          | SharePoint library name                                    |
| `section`       | `Edm.String`, searchable                          | Section heading                                            |
| `content`       | `Edm.String`, searchable                          | Section text (the chunk)                                   |
| `aclGroups`     | `Collection(Edm.String)`, filterable              | Entra group object ids allowed to read the chunk           |
| `contentVector` | `Collection(Edm.Single)`, 1536 dims, HNSW, cosine | Embedding of `title + section + content`                   |

The analyzer for `title`, `section` and `content` is `pt-br.microsoft`.

## 4. Indexing CLI

`npm run index` (workspace `tools/indexer`), run locally by the operator:

1. Sign in interactively as test user A (shared `@kb/test-support` auth), who can read every library.
2. List `.docx` files in the configured site libraries through Graph, download them and reuse
   `extractSections` from `@kb/retrievers` for chunking.
3. Map each library to its allowed Entra groups with a config file
   (`tools/indexer/indexer.config.json`, git-ignored, example committed).
4. Embed each chunk with the embeddings deployment (Azure CLI credential, batched).
5. Create or update the index, then upload chunks in batches and delete chunks whose documents
   disappeared (full reconciliation, no delta logic).
6. Print a content-free summary: documents, chunks, skipped files and failures.

## 5. Runtime

New `AiSearchRetriever` in `packages/retrievers`, implementing the existing `Retriever` interface:

- `resolveGroups(graphToken)`: `GET /me/memberOf?$select=id` (paged, ids only), cached in memory per
  user for the lifetime of the process, alongside the existing OBO cache.
- Query: hybrid search with the question text and its embedding, `top` = the existing chunk limit,
  `filter = aclGroups/any(g: search.in(g, '<caller group ids>'))`, `select` of the non-vector fields.
- Returns the same `Chunk[]` and `RetrievedDocument[]` shapes, so grounding, citations, diagnostics and
  the panel are unchanged. Document rank follows the best-scoring chunk of each document.
- Failures map to the existing `UpstreamError` kinds (`upstream` for search and embedding calls).

`handleAsk` receives a retriever _selector_ instead of a single retriever, and a prompt selector for the
provider. Selection rules:

- Default: `SEARCH_BACKEND` app setting (`graph`) and prompt `v1`.
- `x-kb-retriever: graph|aisearch` and `x-kb-prompt: v1|v2` are honoured **only** when the token carries
  the `Evaluator` role; otherwise they are ignored (not an error).
- The chosen values appear in `ask.completed` logs, in the `ask` span and in `diagnostics`.

## 6. Prompt v2

`prompts/v2.md` keeps every rule of v1 and addresses the observed weakness: two answerable cases were
refused although the right document was retrieved. It states explicitly that a refusal is only correct
when the excerpts do not contain the answer, that partial information must be answered with what is
supported, and it keeps the exact refusal sentence and the citation rules unchanged.

## 7. Evaluation and comparison

- `npm run eval` gains `--retriever <graph|aisearch>` and `--prompt <v1|v2>`; the report file name and
  the report meta record the configuration.
- `npm run eval:compare -- <reportA.json> <reportB.json>` renders `eval/reports/comparison-<date>.md`:
  gates per configuration, quality metrics side by side with deltas, per-case differences (which cases
  changed result) and a plain statement of which configuration wins on which metric.
- The mock client keeps working for `--mock` (it always uses the in-memory retriever and the mock model).
- The README gets the comparison table and the resulting default.

## 8. Error handling

| Situation                               | Behavior                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Search service unavailable or throttled | `UpstreamError("upstream")` → HTTP 502, same as a Graph failure             |
| Embedding call fails                    | Same, before any search request                                             |
| Caller belongs to no group              | Filter matches nothing → empty retrieval → standard refusal                 |
| Index missing or empty                  | Empty retrieval → standard refusal; the CLI is the documented remedy        |
| `x-kb-*` header from a non-Evaluator    | Ignored; defaults apply                                                     |
| Unknown `x-kb-*` value                  | HTTP 400 `invalid-request` for Evaluator callers; ignored for everyone else |

## 9. Testing

- `AiSearchRetriever`: query shape (hybrid, filter, select), group resolution and caching, mapping to
  chunks and documents, rank ordering, empty results, search/embedding failures, and a test proving the
  filter always carries the caller's groups.
- Group resolution: paging, ids only, and that no group list ever comes from request input.
- `handleAsk`: header honoured with the `Evaluator` role, ignored without it, invalid value rejected for
  evaluators, and the selection recorded in logs, span and diagnostics.
- Indexer: chunk building, id sanitization, ACL mapping, reconciliation (delete removed documents) and
  batch splitting, all with fakes; no live calls in unit tests.
- Comparison renderer: deltas, per-case differences, no document text, and behaviour when a metric is
  `n/a` in one report.
- Existing suites (governance, grounding, mock evaluation) stay green.

## 10. Definition of done

1. Terraform creates the search service and the embeddings deployment; `plan` afterwards shows no changes.
2. `npm run index` populates the index; a content-free summary is printed and recorded in the runbook.
3. The deployed API answers with both retrievers, selected per request by an `Evaluator` token only.
4. `npm run eval` produces one report per configuration, and `npm run eval:compare` produces the
   comparison, with all hard gates passing for the shipped default.
5. The E2E no-leak test passes against `aisearch` as well, proving the permission filter on real users.
6. README, architecture, security and runbook updated, ADR-012 (AI Search retriever) and ADR-013
   (prompt v2) written, PLAN updated with the result.

## 11. Execution order

1. Terraform: search module, embeddings deployment, app settings (operator applies through the pipeline).
2. Indexer workspace with tests; first real index (operator).
3. `AiSearchRetriever` and group resolution with tests.
4. `handleAsk` selectors, headers and diagnostics with tests; deploy.
5. Prompt v2.
6. Evaluation flags, comparison renderer and tests.
7. Real runs: graph/v1, aisearch/v1, graph/v2, aisearch/v2; E2E against `aisearch`.
8. Decide the default from the evidence; documentation, ADRs and PLAN.
