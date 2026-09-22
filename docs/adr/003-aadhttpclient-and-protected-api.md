# ADR-003: AadHttpClient and a protected API

- **Status:** accepted

## Context

The browser must call the API with the current SharePoint user's identity and without distributing an
application secret or custom sign-in flow.

## Decision

Use SPFx `AadHttpClient` to acquire a delegated token for an Entra-protected API. Validate the JWT in
the Function before orchestration.

## Alternatives

- Manual MSAL integration
- API key
- Anonymous HTTP endpoint

## Consequences

Authentication remains aligned with SharePoint and the API can derive the caller for OBO. SharePoint
administrator approval is required for the API permission.

## Reversal

Replace the browser client implementation while preserving the API's Entra audience and validation
requirements.
