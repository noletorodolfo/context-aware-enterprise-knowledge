# ADR-008: Event-driven ingestion roadmap

- **Status:** accepted for future implementation

## Context

The current Graph retriever reads permission-trimmed content at question time. Larger corpora need a derived index that follows SharePoint changes without losing idempotency or authorization guarantees.

## Decision

Plan SharePoint webhook notifications, a queue, an idempotent indexer, delta queries, poison handling and subscription renewal as the Phase 7 architecture.

## Alternatives

- Scheduled full crawler
- Native indexer with no explicit event contract
- Continue direct document download indefinitely

## Consequences

The project documents the bounded context and contract now but does not claim it is implemented. The future index must carry verifiable ACL filtering before it becomes a retrieval source.

## Reversal

Adopt a managed ingestion mechanism if it can preserve the same event, deletion and permission semantics.
