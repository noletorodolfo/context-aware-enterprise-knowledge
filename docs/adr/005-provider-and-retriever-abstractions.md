# ADR-005: Provider and retriever abstractions

- **Status:** accepted

## Context

Retrieval and generation vendors, failure modes and test doubles evolve independently.

## Decision

Define explicit retriever and LLM provider contracts in shared packages, with Azure implementations and
a deterministic mock.

## Alternatives

- Direct SDK calls from the HTTP function
- One provider-specific orchestration layer

## Consequences

Tests can exercise orchestration without a live model, and a Phase 6 retriever can be added without
rewriting the API contract. The interfaces are intentionally narrow rather than generic SDK wrappers.

## Reversal

Inline an abstraction if it stops carrying a meaningful policy boundary; keep contract tests before doing so.
