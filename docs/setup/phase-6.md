# Phase 6 — Hybrid retrieval and prompt comparison: runbook

Definition of done: a second retriever that can be measured against the first on the same golden
set, with the default decided by the measurement rather than by preference.

## Checklist

| #   | Item                                                             | Where  | Status |
| --- | ---------------------------------------------------------------- | ------ | ------ |
| 1   | Azure AI Search (Free tier), RBAC data plane, keys disabled      | Azure  | ✅     |
| 2   | Index with ACL field, Portuguese analyzer and HNSW vector, 1536d | Azure  | ✅     |
| 3   | Indexer: chunk, embed, upload and delete stale chunks            | Local  | ✅     |
| 4   | Hybrid retriever (BM25 + vector) filtered by the caller's groups | API    | ✅     |
| 5   | Retriever and prompt selectable per request by evaluators        | API    | ✅     |
| 6   | Prompt v2 and the comparison tool                                | Local  | ✅     |
| 7   | Four real evaluations and three comparisons committed            | Local  | ✅     |
| 8   | End-to-end no-leak suite green under both retrievers             | Tenant | ✅     |

## How the ACL filter works

The index stores, per chunk, the Entra group object ids allowed to read its document
(`tools/indexer/indexer.config.json` maps each library to its groups, and refuses to index a library
that has none). At query time the API reads the caller's own group ids from `/me/memberOf` with the
delegated token it already holds for Graph, and every search is filtered by
`aclGroups/any(g: search.in(g, '<ids>'))`. A caller with no groups gets no results and no query is
issued. The group ids are never taken from the client and never cached across users; the lookup is
cached for 15 minutes keyed by a hash of the token.

This is a copy of the permission state, which is exactly the risk the second retriever introduces:
the index is only as correct as its last run. The Graph retriever has no such window, which is the
main reason it remains the default.

## Selecting a variant

`POST /api/ask` accepts `x-kb-retriever` (`graph` | `aisearch`) and `x-kb-prompt` (`v1` | `v2`) from
callers holding the `Evaluator` app role. For anyone else the headers are ignored — not rejected —
and the deployment defaults apply (`SEARCH_BACKEND`, and the prompt version compiled in). An
evaluator sending an unknown value gets `400 invalid-request`, so a typo in an evaluation run
cannot silently measure the default instead.

## Running an evaluation and a comparison

```bash
npm run index                                        # populate or refresh the index
npm run eval -- --retriever aisearch --prompt v1     # one report per variant
npm run eval:compare -- eval/reports/<A>.json eval/reports/<B>.json
```

Reports are named `<date>-<retriever>-<prompt>.{md,json}` and comparisons
`comparison-<date>-<A>-vs-<B>.md`, so several variants of the same day coexist. Reports contain ids,
counts and reasons only: no document text, no question text beyond the golden set already in the
repository.

## What the measurement decided

See the committed reports in `eval/reports/`. Both retrievers passed every hard gate (no leak,
injection resisted, PII masked) with no errors.

A run is only evidence when it is valid: the runner marks a run invalid when more than 20% of its
executions error, and one `graph`/`v2` attempt hit 55% because the 10K tokens-per-minute quota was
still busy with the previous run. It was re-run rather than reported, and back-to-back evaluations
need a pause between them.

Hybrid retrieval ranked marginally better (MRR 1.000 against 0.980) with identical citation validity,
groundedness, correct refusal and expected-fact rates. The p95 figures span 3.1-4.2 s across the four
variants, which on 33 executions sharing a 10K tokens-per-minute deployment is noise, not a ranking:
they are reported, not used to choose. Prompt v2, which tells the model to answer
when an excerpt answers the question even if the wording differs, changed **no** case result and no
metric under either retriever.

Two conclusions, both negative, both kept:

- **v1 stays the default.** v2 is in the repository as the measurement that justified not shipping it.
- **`graph` stays the default retriever.** The quality difference does not pay for a retriever that
  can serve a stale answer while ingestion is still manual. It becomes the candidate default after
  Phase 7 makes ingestion event-driven.

## What only the real corpus revealed

Three problems appeared when the two paths were measured against the tenant rather than against
mocks, and none of them would have shown up in a unit test:

1. **`/me/memberOf` was not authorized.** The OBO Graph token carried `Sites.Read.All` and
   `Files.Read.All` only, so every `aisearch` request failed with 403 at the group lookup and the
   first evaluation returned 33 errors. Fixed by requesting `User.Read` as well.
2. **The vector path ignored the context budget.** It applied `maxSections` but not `maxChars`, so
   its prompt grew with the index while the Graph path stayed inside 12k characters. Applying the
   same budget brought the p95 of `aisearch`/`v2` from 8.75 s, over the 8 s target, down into the same
   3-4 s band as every other variant.
3. **The same document was cited under two different URLs.** Graph Search returns the path form
   (`.../<library>/<file>.docx`); the drive listing the indexer used returns
   `.../_layouts/15/Doc.aspx?sourcedoc=...`. The library name is only visible in the first, so the
   indexer now rebuilds it. This surfaced because the no-leak suite runs under both retrievers and
   its restricted-library self-check failed instead of passing vacuously.

## Content filter on an adversarial corpus

The demo corpus deliberately contains a document with an injected instruction, and Azure's prompt
shield blocks generation for some questions whose retrieved context includes it:
`content_filter` / `ResponsibleAIPolicyViolation`, category `jailbreak`. The assistant returns its
safe refusal.

Recording the refusal reason in the reports settled what this costs, and corrected an assumption
along the way: **every** case that misses the citation target does so for this reason, under both
retrievers, not only under the vector path. The 8% gap between the measured citation rate and 100% is
the content filter, not weak retrieval — `perm-01/A` fails identically in `graph` and `aisearch`.
Dense retrieval does put the injected document into more contexts (on 30 chunks, a hybrid query
returns most of the corpus whatever the question), but it is not the only path affected.

This is recorded rather than coded around: the platform defense is doing its job on a poisoned
document, and answering would be the worse outcome. Two changes make it diagnosable instead of
opaque — the filtered categories are logged with the refusal, and evaluation reports record _why_ an
answer was refused, so a refusal from the content filter is never confused with one from weak
retrieval.

Because the refusal comes from outside the system and is not deterministic, the end-to-end suite
asserts the permission property on retrieval diagnostics rather than on the answer: the authorized
user must retrieve the restricted document, the unauthorized user must not retrieve it at all, and
the citation is still required whenever the model answered.
