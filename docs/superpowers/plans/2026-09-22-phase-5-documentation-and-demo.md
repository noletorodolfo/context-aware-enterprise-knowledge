# Phase 5 - Documentation and demo: implementation plan

> **For agentic workers:** execute inline. The owner requested no subagents.

**Goal:** turn the completed project into a safe public portfolio narrative, with evidence-based
documentation and a repeatable two-minute demo script.

**Spec:** `docs/superpowers/specs/2026-09-22-phase-5-documentation-and-demo-design.md`

## Global constraints

- Repository content and commits remain in English; the live assistant UI and synthetic examples may stay pt-BR.
- Never write a partner tenant name, hostname, identifier, email, user principal name or opaque live value to a tracked file, image, media artifact, workflow log or commit message.
- Do not claim a live result without a committed test/report/runbook reference.
- The video is recorded by the operator; screenshots/GIFs are optional and require a frame-by-frame anonymity review.
- Keep existing implementation artifacts intact. This phase documents them; it does not redesign the runtime.

## Tasks

### Task 1: Documentation foundation

- [ ] Create the Phase 5 design and this plan.
- [ ] Create `docs/adr/` and the ADR template/index.
- [ ] Verify the current README, reports, runbooks and screenshots against the public-data rule.

### Task 2: Product README

- [ ] Replace the construction-state README with the product narrative, proof points, compact architecture,
      evaluation baseline, operational proof, local commands, documentation map and roadmap.
- [ ] Use only repository-relative links and an existing anonymized image when it improves the first-screen story.
- [ ] Correct outdated phase/status language and rendered table markers.

### Task 3: Architecture and ADRs

- [ ] Create `docs/architecture.md` with C4 context/container diagrams, request and delivery flows,
      data boundaries, quality attributes, cost controls and roadmap boundaries.
- [ ] Create ADRs 001-010 with the common format and links to the implemented evidence.

### Task 4: Security, operations and evidence

- [ ] Create `docs/security.md` with STRIDE, controls, residual risks, privacy boundary and disclosure rules.
- [ ] Create `docs/runbook.md` as an index and concise operational guide linking the detailed phase runbooks.
- [ ] Create `docs/certifications.md` with verifiable evidence links only.

### Task 5: Demo package

- [ ] Create `docs/setup/phase-5.md` with the 120-second recording script, recording checklist, safe
      media checklist and publication options.
- [ ] Update `docs/PLAN.md` to mark Phase 5 documentation complete while keeping recording/publishing
      as an operator-managed final action.
- [ ] Add optional media placeholders only; do not commit video files or external links without review.

### Task 6: Verification and handoff

- [ ] Validate Markdown links and scan tracked files for live values sourced from git-ignored config files.
- [ ] Run `npm run check`.
- [ ] Review every touched document for consistency with code and reports.
- [ ] Commit in focused English Conventional Commit commits, then request the owner's approval to merge and push.
