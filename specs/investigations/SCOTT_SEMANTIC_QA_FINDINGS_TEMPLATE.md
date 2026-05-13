# Scott Semantic QA Findings Template

Reviewer:

Date:

Branch:

Viewer URL:

QA report file:

## Required Label Findings

| Label | Expected meaning | Found yes/no | Actual classification | Classification correct yes/no | Geometry associated yes/no | Geometry looks correct yes/no | Needs override yes/no | Notes |
|---|---|---|---|---|---|---|---|---|
| `7B-020L-04` | Robot/device number, not station | | | | | | | |
| `7B-070L-DN1` | Dunnage station | | | | | | | |
| `7B-070L-DN2` | Dunnage station | | | | | | | |
| `7B-060L-1N` | Nest | | | | | | | |

## False Positives

Labels or notes that became semantic candidates but should not have.

| Label/text | Current classification | Why it is false positive | Action needed |
|---|---|---|---|
| | | | |

## False Negatives

Labels that should have become station/device/nest/dunnage candidates but did not.

| Label/text | Expected classification | Nearby station/device | Action needed |
|---|---|---|---|
| | | | |

## Bad Associations

Correct or useful label/class, but wrong or misleading geometry.

| Label | Current association | Better candidate or expected geometry | Action needed |
|---|---|---|---|
| | | | |

## Useful Associations

Good examples that are useful enough for concept quote/layout review.

| Label | Why useful | Screenshot/note reference |
|---|---|---|
| | | |

## Export Usefulness For Concept Quote/Layout Review

Semantic QA report:

Semantic summary JSON/Markdown:

Advanced layout JSON/CSV/Markdown:

Missing fields or confusing fields:

## Final Decision

Choose one:

- [ ] PASS: start ISSUE-018.
- [ ] PARTIAL: fix semantic rules first.
- [ ] FAIL: do not persist.

Decision notes:

```text

```
