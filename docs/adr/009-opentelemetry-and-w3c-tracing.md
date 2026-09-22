# ADR-009: OpenTelemetry and W3C trace context

- **Status:** accepted

## Context

Troubleshooting a permission-aware answer crosses browser, API, OBO, Graph and model boundaries. Logs must remain content-free.

## Decision

Generate W3C `traceparent` in the SPFx panel, continue it in the Function and emit named OpenTelemetry spans and metrics to Application Insights.

## Alternatives

- A custom correlation ID without distributed tracing
- Application logs only
- Browser telemetry SDK with question content

## Consequences

One trace code follows a request through the system without retaining question or document text. A workbook and KQL provide aggregate and incident views.

## Reversal

Export the same OpenTelemetry contract to a different backend if Application Insights is replaced.
