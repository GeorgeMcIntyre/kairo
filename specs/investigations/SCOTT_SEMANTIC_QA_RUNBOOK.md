# Scott Semantic QA Runbook

Last updated: 2026-05-13

Use this runbook to decide whether ISSUE-019 can move from "QA support ready / manual review pending" to a manual PASS, PARTIAL, or FAIL decision. Do not start ISSUE-018 until this review is captured.

## 1. Branch And Setup

Use branch:

```text
codex/kairo-viewer-semantics
```

From the repo root:

```text
cd C:\Users\George\source\repos\kairo
git switch codex/kairo-viewer-semantics
pnpm.cmd install
pnpm.cmd test -- --minWorkers=1 --maxWorkers=1
pnpm.cmd typecheck
pnpm.cmd build
```

Expected state: tests, typecheck, and build pass. The viewer build may print the known chunk-size warning.

## 2. Start The Viewer

Run:

```text
pnpm.cmd dev
```

Open:

```text
http://localhost:5173/?scene=scott-dxf2013-import
```

The Scott staged scene should load from:

```text
apps/viewer/public/scenes/scott-dxf2013-import
```

If the landing screen appears, click `Load Demo Layout`.

## 3. Prepare The View

1. Click `Fit main`.
2. Set labels to `Auto`. Use `All` if a required label is hidden at the current zoom.
3. Enable `Readable`.
4. Enable `Semantic overlay`.
5. Keep the semantic validation panel open during review.

## 4. Generate The QA Report

With `Semantic overlay` enabled, click:

```text
Download QA MD
```

This downloads:

```text
scott-semantic-qa-report.md
```

Also useful, but secondary:

```text
Download JSON
Download MD
Download AE JSON
Download AE CSV
Download AE MD
```

The QA report is the quickest way to find the required rows, candidate groups, risk markers, and reviewer columns.

## 5. Inspect Required Labels

Required meanings:

| Label | Expected meaning |
|---|---|
| `7B-020L-04` | Robot/device number, not station |
| `7B-070L-DN1` | Dunnage station |
| `7B-070L-DN2` | Dunnage station |
| `7B-060L-1N` | Nest |

For each label:

1. Find its row in `scott-semantic-qa-report.md`.
2. Confirm `Found` is `yes`.
3. Confirm the actual type matches the expected meaning.
4. In the viewer semantic panel, filter by station if helpful, for example `7B-020L`, `7B-070L`, or `7B-060L`.
5. Click the matching semantic candidate row or its overlay marker.
6. Check the properties panel for kind, confidence, association status, candidate groups, linked ids, bounds, and evidence.
7. Visually inspect whether the outline and link line point to the intended nearby geometry.
8. If the wrong geometry is linked, try the session-only geometry override only to understand the better candidate. Record it; do not treat it as persisted.

## 6. Capture Evidence

For each required label, capture:

- A screenshot of the label and nearby geometry with `Semantic overlay` visible.
- A screenshot or note showing the selected semantic details in the properties panel.
- The matching row from `scott-semantic-qa-report.md`.
- Any override that would be needed for the row to become useful.

Also record:

- False positives: labels treated as devices/stations/nests/dunnage that should not be.
- False negatives: important labels that were not detected.
- Bad associations: correct label/class, wrong linked geometry.
- Useful associations: examples that are good enough for concept quote/layout review.

Use:

```text
specs/investigations/SCOTT_SEMANTIC_QA_FINDINGS_TEMPLATE.md
```

## 7. Decide PASS, PARTIAL, Or FAIL

PASS:

- All four required labels are found.
- Classifications match the expected meanings.
- Linked geometry is visually useful for concept quote/layout review.
- Ambiguous/unlinked/risky rows are understood and bounded.
- The report/export is useful enough to justify persistence.

Next: ISSUE-018 may start.

PARTIAL:

- Required labels mostly classify correctly, but one or more links are ambiguous, unlinked, misleading, or need rule tuning.
- The exact fixes are listed in the findings template.

Next: fix the listed semantic rules first. ISSUE-018 remains gated.

FAIL:

- Required labels are missing or commonly misclassified.
- Geometry links are misleading enough that persistence would save bad data.
- The export is not useful for concept quote/layout review.

Next: do not persist. Rework semantic detection/association before re-running this QA.

## 8. Do Not Claim Yet

Until George records the manual result:

- ISSUE-019 is not DONE.
- ISSUE-018 remains gated.
- PoC readiness stays about 89%.
- Semantic associations are heuristic QA output, not final project data.
- Manual overrides are session-only and do not persist after refresh.
