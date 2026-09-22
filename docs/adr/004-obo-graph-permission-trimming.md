# ADR-004: OBO and Graph permission trimming

- **Status:** accepted

## Context

An assistant must never become a parallel authorization system or reveal an excerpt from a document a
caller cannot open.

## Decision

Exchange the validated API token through On-Behalf-Of and use the delegated Graph token for search and
download. Keep site scope, file type and citation grounding checks as defense in depth.

## Alternatives

- App-only crawler with custom ACL filtering
- Unfiltered search with model-side permission instructions
- No retrieval, only static answers

## Consequences

SharePoint remains the authorization source. The request path depends on OBO and Graph availability,
which are represented as typed upstream failures.

## Reversal

A future indexed retriever must preserve authorization semantics through a verified ACL security filter
before it can replace Graph retrieval.
