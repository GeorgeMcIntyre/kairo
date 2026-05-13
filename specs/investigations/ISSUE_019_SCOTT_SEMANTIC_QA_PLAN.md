# ISSUE-019 Scott Semantic QA Plan

Last updated: 2026-05-13

## Purpose

Make the current Scott DXF semantic layer reviewable before Kairo persists semantic corrections or polishes the semantic UI around them.

This checkpoint is **QA support ready / manual review pending**. ISSUE-019 is not DONE until George completes the visual checklist and records whether the associations are useful.

## Scope

In scope:

- Export-first semantic QA report from the effective viewer semantic model after session overrides.
- Required Scott label checks for `7B-020L-04`, `7B-070L-DN1`, `7B-070L-DN2`, and `7B-060L-1N`.
- Deterministic tests for protected classification and report risk markers.
- Reviewer checklist for non-developer visual QA.

Out of scope:

- Persistence for reviewed corrections.
- Importer/schema rewrites.
- Viewer redesign.
- GLB, JT, CAD Exchanger, or Cloudflare work.

## Current Semantic Pipeline

1. DXF text entities are extracted into neutral-scene `text` entities.
2. Text is normalized and safety-profiled for display, association text, long-note handling, and note kind.
3. Station anchors are detected from station labels such as `7B-020L GEO & SPAC`.
4. Device-like labels are classified using station-device tag rules and known support-equipment patterns.
5. Geometry groups are built from block-insert provenance first, then fallback drawing clusters.
6. Labels are associated to geometry by distance, block/layer hints, candidate confidence, and ambiguity checks.
7. Session overrides can change class, choose a candidate geometry group, or unlink a device for export only.

## What The QA Export Proves

- The semantic pipeline found or missed the required Scott labels.
- Required labels classified as the expected kind:
  - `7B-020L-04`: device number, not station.
  - `7B-070L-DN1`: dunnage station.
  - `7B-070L-DN2`: dunnage station.
  - `7B-060L-1N`: nest.
- Each device candidate has an association status, confidence, linked entity count, candidate group IDs, reasons, and risk marker.
- Ambiguous, unlinked, low-confidence, and kind-mismatch rows are reviewable without reading code.

## What Manual Review Must Still Prove

- Required labels are visible/readable in the viewer.
- Linked geometry visually matches the intended robot/device/dunnage/nest.
- Candidate groups are useful enough for concept quote layout review.
- False positives and false negatives are recorded.
- Session overrides needed for demo review are recorded.
- The semantic JSON/Markdown/advanced layout exports are useful enough to justify ISSUE-018 persistence.

## Pass/Fail Criteria

PASS:

- Required labels are found.
- Required labels classify correctly.
- Linked geometry is visually useful for quote/layout review.
- Ambiguous and unlinked rows are understood and bounded.
- Export output is useful enough to persist reviewed corrections.

PARTIAL:

- Labels classify correctly, but some links are ambiguous, unlinked, or need threshold/hint tuning before persistence.

FAIL:

- Required labels are missing or commonly misclassified.
- Linked geometry is misleading.
- Export output is not useful for concept quote/layout review.

## ISSUE-018 Decision Gate

Do not start ISSUE-018 persistence until the checklist result is PASS or an explicit PARTIAL decision lists the specific semantic fixes that must happen first.
