# ISSUE-019 Semantic QA Export

Last updated: 2026-06-05

## Purpose

Create a deterministic semantic QA export for reviewed DXF layouts before Kairo builds larger station, quote, foundation, or persistence features.

This does not complete ISSUE-019 by itself. ISSUE-019 remains manual-review pending until George visually checks the report against the Scott layout.

## Scope

Implemented in:

- `apps/viewer/src/semantic/semanticQaReport.ts`
- `apps/viewer/src/semantic/semanticQaReport.test.ts`
- Existing semantic export panel in `apps/viewer/src/App.tsx`

The module consumes the existing `LayoutSemantics` output only. It does not rewrite DXF data, redesign the app, remove semantic logic, or persist manual overrides.

## Export Contents

Markdown and JSON exports include:

- File/layout summary.
- All detected semantic labels, including stations and devices.
- Detected type and confidence where available.
- Associated nearby geometry group, linked entity IDs, candidate entity IDs, candidate group IDs, block name, and insert handle where available.
- Confidence/evidence reasons for required labels and detected labels.
- Missing/uncertain items, including missing required labels, classification mismatches, ambiguous or unlinked geometry, low confidence device rows, and unknown text.
- Unknown/unclassified labels.
- Duplicate labels.
- Required Scott label checklist.
- Manual review status section.

The Markdown export intentionally has no generated timestamp, so repeated exports from the same semantic model are deterministic.

## Required Scott Labels

| Label | Required meaning |
|---|---|
| `7B-020L-04` | Robot |
| `7B-070L-DN1` | Dunnage station |
| `7B-070L-DN2` | Dunnage station |
| `7B-060L-1N` | Nest |

Tests protect these classifications. In particular, `7B-020L-04` must classify as `robot` and must not become a station anchor.

## Viewer Use

In the viewer:

1. Load a staged scene or local DXF/Kairo package.
2. Enable `Semantic overlay`.
3. Open the `Semantics` panel.
4. Use `Download QA MD` or `Download QA JSON`.

The QA export is review input. It is not persisted project truth.

## Manual Review Gate

Manual review still needs to confirm:

- Required labels are visible in the drawing.
- Classifications match the expected Scott meanings.
- Linked geometry/block/entity references visually make sense.
- Unknown and duplicate labels have been checked.
- False positives, false negatives, and bad associations are recorded.

Do not mark ISSUE-019 done, start persistence, or raise readiness based on the export alone.

## Later Agent A Block Data

The QA export already carries existing block-oriented fields when the current semantic model has them:

- `geometry.groupId`
- `geometry.groupSource`
- `geometry.blockName`
- `geometry.insertHandle`
- `geometry.linkedEntityIds`
- `geometry.candidateGroupIds`
- `geometry.candidateEntityIds`
- `geometry.reason`

Agent A block-instance work can feed richer block identity, transform metadata, or reviewed Kairo metadata/overrides into the existing semantic model later. The QA export should then consume those fields without needing to parse or rewrite source DXF data.

## How To Run / Test

```bash
pnpm typecheck
pnpm test
pnpm build
```

Targeted semantic checks during development:

```bash
pnpm test apps/viewer/src/semantic/layoutSemantics.test.ts apps/viewer/src/semantic/semanticQaReport.test.ts
```

## Known Limitations

- The QA report is deterministic review input, not persisted project truth.
- Geometry association remains heuristic. A linked entity/group means "nearest/plausible by provenance and distance", not confirmed CAD ownership.
- Unknown labels may include legitimate engineering notes that should stay unclassified.
- The required P736 checklist is hard-coded for the current Scott review slice.

## Next Recommended Slice

Persist reviewed semantic overrides and QA decisions into a small project-side review artifact so George can mark false positives, accepted associations, and corrected device types without losing that work between viewer sessions.
