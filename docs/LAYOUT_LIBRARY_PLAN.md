# Kairo Layout Library Plan

Last updated: 2026-06-05

## Purpose

The Layout Library turns extracted DXF layout intelligence into reusable engineering records. It is the bridge between one-off DXF viewing and future live-layout review, correction, and model-assisted training.

This slice is export-first. It does not redesign the viewer, add persistence, or train a model.

## What Changed

- Added `apps/viewer/src/layoutLibrary/layoutPackage.ts`.
- Added a deterministic `LayoutPackage` export built from:
  - source DXF metadata
  - extracted text labels
  - classified devices
  - geometry associations
  - station/cell grouping candidates
  - reusable library item candidates
  - training-pack records
  - Advanced Engineering BOM rows
- Added JSON, CSV, and Markdown exporters.
- Added viewer download buttons for Layout Library JSON/CSV/Markdown.
- Added P736 regression tests for:
  - `7B-020L-04` as robot
  - `7B-070L-DN1` as dunnage station
  - `7B-070L-DN2` as dunnage station
  - `7B-060L-1N` as nest

## MVP Data Flow

```text
DXF / .kairo package
  -> computeLayoutSemantics(...)
  -> buildAdvancedLayoutModel(...)
  -> buildLayoutPackage(...)
  -> JSON / CSV / Markdown package exports
```

## Review Status

Training records use a small review status enum:

- `accepted`: deterministic extraction is mapped, linked to geometry, and above the confidence threshold.
- `corrected`: reserved for future reviewer corrections.
- `rejected`: reserved for future reviewer rejection.
- `uncertain`: extracted item needs review before it should be used as training data.

## How To Run

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Focused test:

```powershell
pnpm test apps/viewer/src/layoutLibrary/layoutPackage.test.ts
```

## Known Limitations

- The package is generated in memory and exported from the viewer. There is no saved project database yet.
- `accepted` means the deterministic extraction passes current MVP checks. It is not engineering release approval.
- Corrected/rejected reviewer records are modeled but not yet editable in the UI.
- Geometry remains entity/reference based with axis-aligned bounds from the current semantic pipeline.
- P736 coverage is synthetic regression coverage until a real reviewed DXF fixture is added.

## Next Recommended Slice

Add a small reviewed fixture workflow:

1. Export a Layout Library JSON package from a real P736/Scott DXF.
2. Have George mark a small set of records as accepted/corrected/rejected/uncertain.
3. Save that reviewed JSON under a fixture path.
4. Add golden tests that compare future extraction against the reviewed fixture.
5. Only after that, add reviewer override controls in the UI.
