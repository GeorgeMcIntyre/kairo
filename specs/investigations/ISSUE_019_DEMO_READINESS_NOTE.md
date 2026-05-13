# ISSUE-019 Demo Readiness Note

Last updated: 2026-05-13

## What Can Be Demoed Now

- The Scott DXF staged scene loading in the browser viewer.
- Text labels, label density modes, readable orientation, and semantic overlay.
- Semantic classification of likely stations, robot/device tags, nests, dunnage, and unknown labels.
- Label-to-nearby-geometry association outlines and link lines.
- Selected semantic candidate details: class, confidence, association status, linked ids, candidate groups, bounds, and evidence.
- Session-only overrides for class, geometry choice, and manual unlink.
- Downloads for semantic summary JSON/Markdown, Scott semantic QA Markdown, and advanced layout JSON/CSV/Markdown.

## Experimental

Describe these as experimental:

- Automatic semantic classification.
- Automatic label-to-geometry association.
- Association confidence and candidate ranking.
- Session-only manual overrides.
- Advanced layout export content.

These are review aids, not final project data.

## Do Not Claim Yet

- Do not claim semantic associations are fully correct.
- Do not claim the Scott layout has passed semantic QA.
- Do not claim reviewed corrections persist.
- Do not claim ISSUE-018 has started.
- Do not claim the export is ready for production quoting without manual review.
- Do not raise PoC readiness above about 89% until George records manual QA evidence.

## Evidence Needed Before Persistence

Before ISSUE-018 may start, George needs to capture:

- Manual PASS or PARTIAL decision in `SCOTT_SEMANTIC_QA_FINDINGS_TEMPLATE.md`.
- Visual confirmation for `7B-020L-04`, `7B-070L-DN1`, `7B-070L-DN2`, and `7B-060L-1N`.
- Notes on false positives, false negatives, bad associations, and useful associations.
- Confirmation that the QA report/export is useful for concept quote/layout review.
- Any required semantic rule fixes if the result is PARTIAL.

## Short Demo Script

"This is not yet a final project model. This is a semantic review layer that finds layout labels, classifies likely devices/stations/nests/dunnage, links them to nearby geometry, and produces a reviewable QA report before we persist anything."

Then show:

1. Load the Scott demo layout.
2. Enable `Semantic overlay`.
3. Select one required label, such as `7B-020L-04`, and explain that it is treated as a device number, not a station.
4. Select `7B-070L-DN1` or `7B-070L-DN2` and show the dunnage classification and linked geometry.
5. Click `Download QA MD` and show the report columns for reviewer result and notes.
6. State that ISSUE-018 remains gated until George finishes the manual visual QA.
