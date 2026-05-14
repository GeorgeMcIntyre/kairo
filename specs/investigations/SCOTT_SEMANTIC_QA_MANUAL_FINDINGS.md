# Scott Semantic QA Manual Findings

Reviewer: George McIntyre
Date: 2026-05-14
Branch: `codex/kairo-viewer-semantics-integrated`
Machine QA baseline commit: `f85a4a7 test: add Scott semantic machine QA`
Viewer URL: `http://127.0.0.1:5197/?scene=scott-dxf2013-import`

## Decision

Manual visual QA = PASS
Machine QA = PARTIAL, accepted with manual confirmation
ISSUE-019 = DONE
ISSUE-018 = ungated and ready to start

George reviewed the ambiguous dunnage labels in the live viewer. The labels and nearby geometry are visually useful for concept quote/layout review. The automated machine result remains valuable because it records that the dunnage geometry association is ambiguous, but the manual review confirms the intended geometry targets.

## Required Label Findings

| Label | Expected meaning | Found | Actual classification | Classification correct | Geometry associated | Geometry looks correct | Needs override | Notes |
|---|---|---|---|---|---|---|---|---|
| `7B-020L-04` | Robot/device number, not station | yes | `device_number` | yes | yes, machine linked | yes | no | Machine QA linked 105 entities. |
| `7B-070L-DN1` | Dunnage station | yes | `dunnage` | yes | machine ambiguous | yes | no for v1 | Visual review shows DN1 beside the horizontal magenta dunnage/rack fixture. Persisted review should remember the confirmation even if automatic association remains ambiguous. |
| `7B-070L-DN2` | Dunnage station | yes | `dunnage` | yes | machine ambiguous | yes | no for v1 | Visual review shows DN2 beside the vertical magenta dunnage/rack fixture. Persisted review should remember the confirmation even if automatic association remains ambiguous. |
| `7B-060L-1N` | Nest | yes | `nest` | yes | yes, machine linked | yes | no | Machine QA linked 3874 entities. |

## Follow-Up For ISSUE-018

- Persist a project-level semantic review JSON file.
- Preserve the full effective semantic device snapshot for auditability.
- Persist reviewer confirmations for the four required labels, including confirmed geometry for DN1 and DN2.
- Persist overrides separately from confirmed automatic associations.
- Do not treat the automatic dunnage ambiguity as a rule failure; treat it as an association that has been manually confirmed for this reviewed scene.

## Known Limits

- This manual pass is targeted at the required ISSUE-019 labels, not every semantic candidate in the Scott layout.
- Automated associations remain heuristic evidence.
- The reviewed state does not persist until ISSUE-018 is implemented.
