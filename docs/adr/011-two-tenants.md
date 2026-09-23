# ADR-011: Two tenants, identity separate from infrastructure

- **Status:** accepted

## Context

The assistant runs inside a real Microsoft 365 tenant that owns the SharePoint site, the users and
the groups, while the paid Azure resources live in a separate personal subscription. A tenant with
SharePoint and a subscription with budget were not available as one tenant.

## Decision

Split the deployment along the tenant boundary: `azuread` resources (app registrations, consent,
group lookups) in the Microsoft 365 tenant, `azurerm` resources (state, Functions, monitoring,
Search) in the subscription tenant, as two Terraform roots that exchange values through
`terraform_remote_state`.

## Alternatives

- One tenant with a trial subscription: no budget, and a trial expires mid-project
- A single Terraform root with two provider aliases: one plan would need credentials for both
  tenants at once, which the CI identity must not hold

## Consequences

The pipeline only ever holds subscription credentials, so no automated run can change identity or
consent; those applies are operator-run and reviewed. The cost is the indirection of remote state
between roots, and an OBO exchange that cannot use a managed identity as a federated credential
across the boundary, which is why the API proves itself with a Key Vault-signed certificate
assertion (ADR-007).

## Reversal

If the SharePoint tenant ever gains a funded subscription, collapse the roots and replace the
certificate assertion with a federated managed identity.
