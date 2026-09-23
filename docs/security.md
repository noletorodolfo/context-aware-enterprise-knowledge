# Security and privacy

## Security objectives

1. Never answer from a document the caller cannot open in SharePoint.
2. Keep secrets, tokens, document content and personal data out of source control and logs.
3. Prevent retrieved content from changing the assistant's instructions.
4. Make failure safe: a missing context, invalid model output or content-filter block must not leak data.
5. Keep the public repository and CI output independent from the live partner environment.

## Data classification and boundaries

| Data                             | Handling                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Synthetic documents              | Tracked in the repository; used for tests and public evidence                                      |
| Live document content            | Read at runtime through delegated Graph access; never committed or logged                          |
| Access tokens and refresh tokens | Memory or local ignored caches only; never logged or committed                                     |
| Terraform live configuration     | Ignored local files and GitHub secrets; values are redacted from plan output                       |
| Personal data in a question      | Masked before retrieval, generation and application logs                                           |
| Telemetry                        | Counts, durations, kinds and opaque trace identifiers; no question, quote, document or answer text |

## Threat model

| STRIDE category        | Threat                                                             | Primary controls                                                                                                                        | Residual risk                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Caller submits a forged or expired token                           | JWT issuer/audience/tenant/expiry validation; Entra ID-issued token only                                                                | Compromise of a valid user account remains an identity-provider concern                                                                      |
| Tampering              | Retrieved document instructs the model to ignore policy            | Untrusted delimiters, tag neutralization, system prompt, structured output, grounding and injection tests                               | New attack patterns require ongoing evaluation                                                                                               |
| Repudiation            | An incident cannot be followed end to end                          | W3C trace context, OpenTelemetry spans, correlation code and workbook                                                                   | Telemetry intentionally excludes content, limiting forensic detail                                                                           |
| Information disclosure | Restricted document appears in another user's answer               | OBO delegated Graph Search or an ACL-filtered index query, scope checks, citation grounding and no-leak E2E tests under both retrievers | Search semantics and SharePoint permissions must remain correctly administered; the index's copy of the ACL is only as fresh as its last run |
| Denial of service      | Graph or model outage, throttling or content filter blocks answers | Typed errors, timeouts, safe refusals and alerting; one retry only for schema-invalid model output                                      | Shared model quota can still cause temporary 503 responses                                                                                   |
| Elevation of privilege | CI or runtime gains broad tenant access                            | Separate tenant root, OIDC identities, managed identity, key-scoped Key Vault role and protected deployment environment                 | The operator retains necessary local administration rights                                                                                   |

## Controls in depth

### Identity and permissions

- The API validates the user's Entra ID JWT before doing work.
- OBO obtains a delegated Graph token for that exact caller. Graph and SharePoint enforce the user's
  existing access; the application does not reconstruct document ACLs.
- The OBO client assertion is signed with a non-exportable Key Vault key. Azure OpenAI uses managed
  identity, not an API key.
- Evaluator diagnostics require an explicit Entra app role. Normal callers do not receive retrieval
  metadata or timings.
- GitHub Actions uses workload identity federation for the Azure subscription. It has no partner-tenant
  credential; partner identity is an operator-local Terraform root.

### Input, retrieval and generation

- CPF, CNPJ, email and phone patterns are masked before retrieval and model generation.
- Search results are constrained to configured sites, file type and size, then selection happens before
  prompt construction.
- Document text is delimited and identified as untrusted. Attribute escaping and tolerant tag
  neutralization prevent prompt envelope injection.
- Model output is constrained to JSON, validated with Zod and retried only for schema-invalid output.
- Citations must reference a retrieved excerpt. Ungrounded answers and unavailable context become a
  standard refusal, not a best-effort answer.

### Observability and operations

- Logs contain counts, durations, error codes and kinds, never question or answer text.
- OpenTelemetry propagates a browser trace ID across the API, Graph retrieval, Key Vault signing and
  model generation. Span attributes follow the same content-free rule.
- Terraform plan comments render resource actions and addresses only. Values and identity-state
  outputs are masked before commands run in CI.
- An Application Insights workbook and error-rate alert detect availability problems without collecting
  document content.

## Ingestion path (Phase 7)

| Threat                 | Scenario                                                        | Control                                                                                                                         | Residual risk                                                                        |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Spoofing               | Anyone posts a forged change notification to the public webhook | Subscription `clientState` from Key Vault, 64 random characters, compared without an early return; rejected counts in telemetry | A leaked `clientState` allows forged notifications, whose only effect is a re-read   |
| Elevation of privilege | The ingestion identity reads content it was never meant to      | Application permission is `Sites.Selected`, granted on the demo site alone; separate registration and certificate from the API  | A site grant is a manual step, so a wrong grant is a human error with real reach     |
| Tampering              | Wrong ACL group ids are written into the index                  | Ingestion is the only writer; a library with no configured groups fails closed at indexing time, in the CLI and in the Function | The index mirrors the ACL as configured, not as SharePoint enforces it               |
| Repudiation            | A change is silently lost                                       | The delta cursor advances only after the changes are applied; failures return to the queue and then to a poison queue           | A poisoned message needs an operator to look at it; there is no alert on queue depth |

## Known limitations and residual risks

- The demo corpus is synthetic and small; its quality baseline cannot prove production quality on an
  arbitrary intranet.
- Azure OpenAI content filters and shared quota may produce a safe refusal or a temporary unavailable
  response. They are intentionally not bypassed.
- Two retrievers enforce permissions by different means. Graph Search trims at the source and cannot
  serve stale content, but downloads documents at request time. The hybrid Azure AI Search path
  filters on Entra group ids copied into the index at indexing time: a group membership revoked after
  the last run is still honoured for the caller (their live groups are read per request) but a
  document moved to a more restrictive library is not, until the index is refreshed. That window is
  why `graph` remains the default until ingestion is event-driven (Phase 7). Indexing fails closed on
  a library with no configured groups, and a caller with no groups is never queried for.
- Azure's prompt shield blocks generation for some questions whose retrieved context includes the
  deliberately injected document, which the assistant reports as a safe refusal. The filtered
  categories are logged so such a refusal is distinguishable from weak retrieval.
- SharePoint package publication and SharePoint API permission approval remain manual operator steps.
- PII masking targets four common Brazilian categories. It is a guardrail, not a complete data-loss
  prevention system.
- A public repository requires continuing review of screenshots, generated reports and GitHub workflow
  output whenever the live environment changes.

## Incident and disclosure rules

If a partner identifier, secret, token or live content appears in a tracked file, commit, image,
workflow log or public issue: stop publication, revoke or rotate the affected credential where
applicable, remove the value from current files, rewrite public history if it contains the value, and
document the remediation without repeating the value. Do not paste live configuration into issues or
pull-request comments.
