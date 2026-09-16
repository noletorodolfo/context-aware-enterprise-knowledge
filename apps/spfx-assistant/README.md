# spfx-assistant

SharePoint Framework (SPFx) application customizer that embeds the
knowledge assistant in SharePoint pages. It renders a launcher button and a
chat panel, calls the Knowledge API (`apps/knowledge-api`) with the current
user's token, and shows the answer with its source citations.

## Prerequisites

- Node 22 (see the repo root `.nvmrc`).
- The SPFx toolchain (`@microsoft/*` packages, Heft) installed via
  `npm install` at the repo root; no separate global install is required.

## Configuration

Copy the example API config and adjust it for your environment:

```bash
cp config/api.example.json config/api.json
```

`config/api.json` is git-ignored and holds the Knowledge API base URL and
Azure AD app registration details used by the client.

## Setup and build

From this directory:

```bash
npm install
npm run elements
npm run build
```

`npm run elements` generates the SharePoint tenant-wide extension elements
manifest. `npm run build` runs the test suite and produces
`sharepoint/solution/spfx-assistant.sppkg`, the package uploaded to the
tenant App Catalog.

## Tests

```bash
npm run test:unit
```

## Installing and verifying

See [`docs/setup/phase-1.md`](../../docs/setup/phase-1.md) for the full
runbook: uploading the package to the App Catalog, approving API access,
adding the app to a site, and the acceptance checks.
