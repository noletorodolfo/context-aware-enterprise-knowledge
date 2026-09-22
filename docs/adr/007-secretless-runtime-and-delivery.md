# ADR-007: Secretless runtime and delivery authentication

- **Status:** accepted

## Context

The solution crosses a Microsoft 365 tenant and a separate Azure subscription. Static client secrets would create disclosure and rotation risk.

## Decision

Use managed identity for Azure OpenAI, a Key Vault non-exportable key for the OBO certificate assertion, and GitHub Actions OIDC identities for Azure delivery. Keep partner identity Terraform local to the operator.

## Alternatives

- Client secret stored in Key Vault
- Client secret stored in GitHub
- GitHub credential with access to both tenants

## Consequences

No long-lived Azure secret is stored in GitHub. OBO uses a certificate assertion because a managed identity cannot directly serve as a federated credential for the cross-tenant app registration.

## Reversal

Replace the assertion mechanism only after verifying a more secure supported cross-tenant alternative; do not introduce a client secret merely for convenience.
