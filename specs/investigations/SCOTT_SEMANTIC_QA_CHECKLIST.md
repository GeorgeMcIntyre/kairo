# Scott Semantic QA Checklist

Last updated: 2026-05-13

Use this checklist with the viewer semantic overlay and the downloaded `scott-semantic-qa-report.md`.

Viewer URL:

```text
http://localhost:5173/?scene=scott-dxf2013-import
```

## Load Check

- [ ] Scott DXF staged scene loads without a visible error.
- [ ] Main facility layout is visible after load.
- [ ] Text labels are visible in Auto or All mode.
- [ ] Semantic overlay can be enabled.
- [ ] Semantic panel counts are visible.

Notes:

```text

```

## Required Label Check

| Label | Expected meaning | Found | Classification correct | Geometry link useful | Reviewer notes |
|---|---|---|---|---|---|
| `7B-020L-04` | Robot/device number, not station | [ ] | [ ] | [ ] | |
| `7B-070L-DN1` | Dunnage station | [ ] | [ ] | [ ] | |
| `7B-070L-DN2` | Dunnage station | [ ] | [ ] | [ ] | |
| `7B-060L-1N` | Nest | [ ] | [ ] | [ ] | |

## Association Review

- [ ] Linked device outlines sit around the intended nearby geometry.
- [ ] Association lines connect labels to sensible geometry centers.
- [ ] Ambiguous rows in the QA report are reviewed.
- [ ] Unlinked rows in the QA report are reviewed.
- [ ] Low-confidence rows in the QA report are reviewed.
- [ ] Candidate group IDs in the selected-device panel match the report.

Notes:

```text

```

## False Positives

Record labels or notes that became devices but should not have.

| Label/text | Current type | Why false positive | Action needed |
|---|---|---|---|
| | | | |

## False Negatives

Record labels that should have become station/device/dunnage/nest candidates but did not.

| Label/text | Expected type | Nearby station/device | Action needed |
|---|---|---|---|
| | | | |

## Overrides Needed

Record session overrides that should become persisted corrections in ISSUE-018 if this QA pass is accepted.

| Label | Override type | Correct value | Reason |
|---|---|---|---|
| | class / geometry / unlink | | |

## Export Usefulness

- [ ] Semantic summary JSON is useful for review.
- [ ] Semantic summary Markdown is useful for review.
- [ ] Scott semantic QA Markdown is useful for review.
- [ ] Advanced layout JSON/CSV/Markdown is useful for concept quote layout review.

Notes:

```text

```

## Final Decision

Choose one:

- [ ] PASS: safe to start ISSUE-018 persistence.
- [ ] PARTIAL: fix listed semantic issues before persistence.
- [ ] FAIL: do not persist semantics yet.

Decision notes:

```text

```
