# Phase 5 - Documentation and demo: runbook

This phase turns the implemented system into a reviewable public portfolio without exposing the live
Microsoft 365 environment. It does not change Azure resources or SharePoint configuration.

## Checklist

| #   | Item                                                                    | Status                |
| --- | ----------------------------------------------------------------------- | --------------------- |
| 1   | Product README with outcome, evidence, architecture and roadmap         | complete              |
| 2   | Architecture, security, operations and certification evidence documents | complete              |
| 3   | ADRs 001-010                                                            | complete              |
| 4   | Public-data and link review                                             | complete before merge |
| 5   | Two-minute recording                                                    | complete              |
| 6   | Recording reviewed frame by frame, redacted and published               | complete              |

## Two-minute recording script

Record locally. Use only the synthetic documents and test accounts; do not narrate or reveal the
organization behind the integration.

| Time      | Scene               | What to show and say                                                                                                                                  |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:15 | Problem             | "SharePoint permissions already define who may read a document. The assistant must preserve that boundary while returning a useful cited answer."     |
| 0:15-0:45 | Public answer       | Open the assistant, ask a public-policy question in pt-BR, then open the cited source. Point out the citation list.                                   |
| 0:45-1:10 | Permission boundary | Ask a restricted question as the permitted user, then repeat it as the restricted user. Show the cited answer versus the safe refusal.                |
| 1:10-1:30 | Governance          | Show the PII notice with a synthetic example, then the committed golden-set report with all three hard gates passing.                                 |
| 1:30-1:50 | Operations          | Show a distributed trace or the workbook and the green CI workflow / value-free Terraform plan summary.                                               |
| 1:50-2:00 | Close               | Summarize: delegated permissions, validated citations, PII masking, evaluation and reproducible delivery. Mention hybrid retrieval as the next phase. |

Do not optimize this into a product advertisement. The strongest proof is the before/after permission
comparison and its corresponding automated E2E evidence.

## Recording checklist

Before recording:

1. Use an incognito or clean browser profile with only the necessary tabs open.
2. Hide browser address bars, tenant branding, account menus, bookmarks and notifications.
3. Keep the viewport on the assistant and the synthetic document/citation content.
4. Use test users whose names and addresses are not shown in the recording.
5. Prepare the evaluation report, a trace or workbook query, and the green workflow in separate tabs.

After recording:

1. Watch it at full resolution before uploading it anywhere.
2. Pause on every transition and check for hostnames, account names, opaque IDs, email addresses,
   timestamps, browser history and notification previews.
3. Crop or blur a frame rather than relying on a spoken disclaimer.
4. Host the final video outside the git history — a GitHub release asset keeps the link stable without
   putting a binary in every clone — and add its README link only after this review.

### What the review found in the published recording

The review is not a formality: the first cut of this recording exposed the tenant hostname in the
browser address bar. It was measured rather than eyeballed, by sampling the address-bar band of every
frame and flagging the ones with a dark bar and light glyphs:

| Version  | Frames with a readable URL | Interval          |
| -------- | -------------------------- | ----------------- |
| original | 154                        | 55.12 s - 74.25 s |
| redacted | 0                          | -                 |

The fix was a solid black box over the top 100 px for that interval only — solid rather than blurred,
because a blur can sometimes be reversed and a box cannot:

```bash
ffmpeg -i recording.mp4   -vf "drawbox=x=0:y=0:w=iw:h=100:color=black@1.0:t=fill:enable='between(t,54.5,75.0)'"   -c:v libx264 -crf 21 -preset medium -pix_fmt yuv420p -movflags +faststart   -c:a copy -map_metadata -1 demo.mp4
```

`-map_metadata -1` drops the editor's metadata as well. Re-encoding also took the file from 78 MB to
10 MB, since screen capture rarely needs the bitrate a camera does. The unredacted original stays on
the operator's machine: `videos/` is git-ignored precisely so it cannot be committed by accident.

## Optional GIF

A GIF is optional. It is useful only if it makes the README clearer than the existing anonymized image.
If created, keep it under a few megabytes, use no audio, show one public answer and one restricted
refusal, and run the same frame-by-frame review. Do not commit a GIF generated directly from an
unredacted screen recording.

## Public-data review

Before merging documentation changes:

```powershell
git diff --check
npm run check
```

Then search every tracked file, report, commit message and workflow log for each value held in the
ignored local configuration files (`terraform.tfvars`, `backend.hcl`, `config/api.json`,
`e2e.config.json`, `eval.config.json`), and look at every image by eye. The comparison values themselves must never be placed in a script, issue,
pull-request comment or tracked document.

## Evidence links

- [README](../../README.md)
- [Architecture](../architecture.md)
- [Security](../security.md)
- [Operations runbook](../runbook.md)
- [Certification evidence](../certifications.md)
- [Latest real evaluation](../../eval/reports/2026-09-19.md)
