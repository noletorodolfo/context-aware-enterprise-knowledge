# ADR-010: Terraform and reviewed OIDC delivery

- **Status:** accepted

## Context

The infrastructure must be reproducible without publishing configuration values or granting pull requests write access.

## Decision

Use Terraform modules and Azure Storage remote state. GitHub Actions authenticates with OIDC, produces value-free plans on pull requests and applies the Azure root only after protected-environment approval.

## Alternatives

- Bicep or portal-managed infrastructure
- Stored Azure credentials in GitHub
- Automatic apply from every branch

## Consequences

The public pipeline has auditable, low-disclosure plans. Azure and partner identity roots remain intentionally split; the latter is a local operator action.

## Reversal

Migrate state and workflows to another IaC tool only after preserving review, secretless authentication and recovery guarantees.
