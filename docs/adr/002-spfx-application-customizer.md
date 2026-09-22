# ADR-002: SPFx Application Customizer

- **Status:** accepted

## Context

The assistant should be available consistently across SharePoint pages without requiring authors to
place a web part on each page.

## Decision

Use an SPFx Application Customizer with the `Bottom` placeholder and an accessible React panel.

## Alternatives

- Web part on every page
- Iframe hosted outside SharePoint
- Direct DOM injection

## Consequences

The UI inherits SharePoint authentication and page context through SPFx. It must tolerate placeholder
availability and retain compatibility with the SPFx toolchain.

## Reversal

Move the panel into a web part or Teams/Copilot surface while retaining the API contract.
