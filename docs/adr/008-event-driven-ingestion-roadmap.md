# ADR-008: Event-driven ingestion roadmap

- **Status:** accepted; implemented in Phase 7

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

## Implementation

Built in Phase 7 as designed: a versioned `DocumentChanged` event, a Storage queue, a consumer that
asks Graph what changed rather than trusting the event, deterministic chunk keys, a leased delta
cursor advanced only after the changes are applied, deletion through the same delta query, a poison
queue and a renewal timer. The condition this ADR set was met first: ACL filtering became verifiable
in Phase 6, and the end-to-end suite proves it for both retrievers. See the
[Phase 7 runbook](../setup/phase-7.md) and [ADR-014](014-app-only-ingestion-identity.md).

## Reversal

Adopt a managed ingestion mechanism if it can preserve the same event, deletion and permission semantics.
