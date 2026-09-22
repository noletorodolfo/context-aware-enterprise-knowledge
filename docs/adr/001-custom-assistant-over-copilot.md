# ADR-001: Custom assistant over Microsoft 365 Copilot

- **Status:** accepted

## Context

The project needs a cited, permission-aware assistant in SharePoint while keeping retrieval, prompt,
evaluation and delivery controls visible as portfolio evidence.

## Decision

Build a focused custom assistant instead of configuring Microsoft 365 Copilot or Copilot Studio.

## Alternatives

- Microsoft 365 Copilot
- Copilot Studio
- Native SharePoint search only

## Consequences

The project owns authentication, retrieval, grounding and operations, which creates engineering work
but makes the security and quality controls inspectable. It does not claim feature parity with Copilot.

## Reversal

The SPFx panel can become a front end for a managed Copilot experience; the synthetic corpus and
evaluation set remain useful acceptance evidence.
