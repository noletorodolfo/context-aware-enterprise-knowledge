# ADR-012: Hybrid Azure AI Search retriever alongside Graph Search

- **Status:** accepted

## Context

The Graph Search retriever asks Microsoft Graph for documents the caller can already open, then
selects sections by keyword occurrence. It is always fresh and needs no copy of the corpus, but it
cannot match a question to a passage that uses different words, and it downloads whole documents at
query time.

## Decision

Add a second retriever over Azure AI Search that runs a hybrid query (BM25 plus a vector query over
`text-embedding-3-small` embeddings) against an index of pre-chunked sections, and filter every
query by the caller's Entra group ids (`aclGroups/any(g: search.in(g, ...))`). The group ids come
from `/me/memberOf` on the caller's own delegated token, never from a cached copy. Which retriever
serves a request is selectable per request by holders of the `Evaluator` app role, and by
`SEARCH_BACKEND` for everyone else, so the two can be measured against the same golden set.

## Alternatives

- Replace Graph Search: gives up the retriever that needs no index and cannot serve stale content
- Vector-only search: loses exact matches on identifiers and figures, which BM25 gets right
- Index-level security trimming by SharePoint identity: not available; the ACL has to be copied

## Consequences

Permissions are now enforced in two different places, so both are tested end to end: the suite
asserts that the unauthorized user does not even retrieve a restricted document under either
retriever. Copying group ids into the index is the main risk this introduces, and it fails closed —
a library without configured groups is refused at index time, and a caller with no groups gets no
results without a query being issued.

Measured against the real tenant, hybrid retrieval ranked slightly better (MRR 1.000 against 0.980)
with no difference in citation validity or groundedness, which is not enough on its own to change
the default: the Graph path cannot serve a stale answer, while this one is only as fresh as its last
indexing run. It stays selectable until ingestion is event-driven (ADR-008).

One effect only the real corpus revealed: dense retrieval returns `k` chunks whatever their
relevance, so on a small corpus the deliberately injected supplier FAQ enters contexts where it is
irrelevant, and Azure's prompt shield then blocks generation (`jailbreak`) for some questions. The
assistant returns its safe refusal, which is the correct outcome; the platform defense is doing its
job on an adversarial fixture. It is recorded rather than coded around, and the refusal is
diagnosable because the filtered categories are logged.

## Reversal

Point `SEARCH_BACKEND` back at `graph` and stop indexing; the index holds no data that is not in
SharePoint.
