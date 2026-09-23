# ADR-014: App-only ingestion identity, scoped to one site

- **Status:** accepted

## Context

Event-driven ingestion runs with no user present, so it cannot borrow the caller's permissions the way
the API's On-Behalf-Of exchange does. It needs to read every document in the watched libraries and to
write the search index — two things the API's identity must never be able to do.

## Decision

Give ingestion its own application registration with the Graph application permission
`Sites.Selected`, granted on the demo site alone, and its own non-exportable Key Vault certificate for
the client credentials grant. Its managed identity is the only principal with
`Search Index Data Contributor`; the API keeps `Search Index Data Reader`.

## Alternatives

- Reuse the API's registration: one compromised assertion would then reach both paths, and the API
  would gain app-only read over SharePoint that its threat model explicitly excludes
- `Sites.Read.All` application permission: tenant-wide read of every site, for a demo that needs one
- A service account with a stored refresh token: a long-lived secret, and a user whose password policy
  and MFA state become a dependency of ingestion
- Managed identity directly: impossible across the tenant boundary (ADR-011), which is why the
  certificate assertion exists in the first place

## Consequences

The blast radius of the ingestion identity is one site and one index. `Sites.Selected` costs an extra
operator step — a per-site Graph grant that Terraform does not model — which is documented in the
Phase 7 runbook, and a tenant-wide consent that grants nothing until that step is taken.

Permissions are now enforced twice over: the index stores the group ids that may read each chunk, and
ingestion is the only writer of those ids. A wrong ACL in the index is therefore a bug in one
component, not something any caller can influence.

The webhook endpoint is necessarily anonymous, because Graph cannot authenticate to it. That is
mitigated, not solved, by the subscription's `clientState`: a 64-character secret from Key Vault,
compared without an early return, with dropped notifications counted in telemetry.

## Reversal

Delete the application registration and the site grant; the index keeps whatever it holds and the
operator CLI can still rebuild it from SharePoint.
