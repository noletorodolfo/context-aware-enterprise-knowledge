# Certification and engineering evidence

This table intentionally lists only concepts that have inspectable evidence in this repository. It is
not a claim of certification status.

| Topic                | Demonstrated concept                                                                                              | Repository evidence                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AZ-104               | Entra application, delegated permissions, managed identity, Key Vault, Azure Functions, monitoring and RBAC       | [identity module](../infra/terraform/modules/identity/), [function app module](../infra/terraform/modules/function-app/), [Phase 4 runbook](setup/phase-4.md)                         |
| AZ-305               | Architecture decisions, cross-tenant boundary, quality attributes and recovery design                             | [architecture](architecture.md), [ADRs](adr/), [Phase 4 design](superpowers/specs/2026-09-18-phase-4-infrastructure-and-ci-cd-design.md)                                              |
| Azure AI Engineer    | Permission-aware RAG, structured output, grounding, PII masking, prompt-injection defense and an evaluated prompt | [provider](../packages/llm-providers/), [governance](../packages/governance/), [golden set](../eval/golden-set.json), [report](../eval/reports/2026-09-19.md)                         |
| Terraform Associate  | Modules, remote state, reusable roots, plan on PR, approved apply, linting and policy scanning                    | [Terraform root](../infra/terraform/), [infra workflow](../.github/workflows/infra.yml), [Phase 4 runbook](setup/phase-4.md)                                                          |
| DevOps practices     | CI checks, value-free plan summary, OIDC, protected deploy and tested recovery                                    | [CI workflow](../.github/workflows/ci.yml), [deploy workflow](../.github/workflows/deploy.yml), [plan summary](../scripts/plan-summary.mjs)                                           |
| OpenTelemetry        | W3C trace propagation, explicit spans, metrics, trace lookup and a workbook                                       | [tracing helper](../packages/core/src/tracing.ts), [telemetry](../apps/knowledge-api/src/telemetry.ts), [Phase 3 trace guide](setup/phase-3.md#follow-one-question-as-a-single-trace) |
| DDD                  | Query, Governance and planned Ingestion bounded contexts with shared vocabulary                                   | [bounded contexts](PLAN.md#33-bounded-contexts-ddd), [core contracts](../packages/core/src/), [governance](../packages/governance/)                                                   |
| DDIA                 | Derived-data and idempotent-ingestion direction documented as a future boundary                                   | [ADR-008](adr/008-event-driven-ingestion-roadmap.md), [project plan](PLAN.md#7-data-ingestion-event-driven)                                                                           |
| Event-driven systems | Versioned event contract, queue, poison queue and renewal are an explicit future design                           | [project plan](PLAN.md#7-data-ingestion-event-driven), [ADR-008](adr/008-event-driven-ingestion-roadmap.md)                                                                           |

## Evidence standard

An item belongs here only when a reviewer can follow a link to code, a test, a Terraform resource, a
runbook or a committed report. Planned Phase 6+ work is labelled as a roadmap item rather than an
implemented capability.
