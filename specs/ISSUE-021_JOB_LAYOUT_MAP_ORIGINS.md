# ISSUE-021 Job Layout Map Origins

Last updated: 2026-05-13

## Purpose

Kairo needs a job-level layout map so a job can later contain multiple related layouts:

- concept layout
- robot/device layouts
- foundation/site layout
- reference layout
- shared coordinate/origin map

This issue adds the foundation only. It does not implement drag movement, push/space modes, multi-file composition UI, or source DXF rewrites.

## Model Added

The layout map lives in Kairo job/session metadata, separate from imported scene geometry:

- `KairoJobSession`
- `JobLayoutMap`
- `JobLayoutTransform`
- `CoordinateReadout`

Each layout transform records:

- `layoutId`
- `fileName`
- `type`: `concept`, `device`, `foundation`, `reference`, or `unknown`
- `originX`, `originY`
- `translationX`, `translationY`
- `rotation`
- `scale`
- `visible`
- `locked`
- optional `parentLayoutId`

The current viewer creates one layout record for the loaded scene package. That keeps the existing single-DXF workflow intact while giving future multi-layout jobs a stable metadata container.

## Transform Semantics

Original DXF-derived entity coordinates remain unchanged. Layout transforms are applied as metadata/overrides:

```text
world = origin + translation + rotate(scale * (layoutLocal - origin))
```

The inverse `world -> layout local` uses the same origin, translation, rotation, and scale. Scale must be non-zero so the transform remains invertible.

Pure utilities exist for:

- layout local -> world
- world -> layout local
- apply translation
- apply rotation
- apply scale
- set origin

## Coordinate Readout

The viewer job session now stores coordinate readout metadata:

- cursor world coordinate
- selected entity/object world coordinate
- selected layout origin
- active/selected layout IDs

The inspector shows these values for the active layout. This is a readout only; it does not move geometry.

## Compatibility

This foundation is compatible with future block/device instances because transforms live at the layout/job layer, not inside source entity records. Semantic overrides and semantic QA data remain separate from layout transforms.

## Known Limits

- Only one loaded layout is represented today.
- Layout transforms are not yet editable in the UI.
- Non-identity transforms are not yet applied to rendered geometry.
- No drag movement, locking behavior, push/space modes, or multi-layout file manager exists yet.
- No persisted `.kairo` session extension is written yet; the session model is in app/core state.

## Verification

Required checks:

```powershell
pnpm.cmd test -- --minWorkers=1 --maxWorkers=1
pnpm.cmd typecheck
pnpm.cmd build
```
