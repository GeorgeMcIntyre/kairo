# Kairo Viewer UI Skill

Use this for viewer UI, drawing-first workflow, panels, layers, text overlay, picking, Workbench, and browser-facing checks.

## Goal Shape

Kairo viewer is a drawing review tool. The canvas is primary; controls and panels should support scanning, isolating, selecting, and reviewing dense DXF geometry.

## Allowed

- Improve toolbar grouping, panel toggles, and canvas ergonomics.
- Keep Layers, Semantics, Inspector, Workbench, and Diagnostics hideable.
- Add small, predictable controls for fit/view/layers/text.
- Improve Layer search/filter/isolate/show-all/hide-all behavior without importer changes.
- Add focused React/unit tests for pure UI state helpers and data transforms.
- Update `specs/VIEWER_QA_WORKFLOW.md` when manual QA expectations change.

## Not Allowed

- Do not change importer, schema, GLB/JT/export, or semantic association logic as part of UI polish.
- Do not replace batched rendering with one Three.js object per entity.
- Do not make Diagnostics visually dominant by default.
- Do not remove sample scene support.
- Do not hardcode the Scott scene into production-only UI paths.
- Do not claim browser visual QA from unit tests alone.

## Performance Invariants

- Preserve one `THREE.LineSegments` batch per geometry document.
- Layer visibility should toggle object visibility, not rebuild the full scene.
- Fit, selection highlight, panel toggles, and layer toggles should not trigger geometry repacking.
- Pointer picking should reuse cached pickable objects and scratch math objects where possible.

## Manual QA Pointers

Use `specs/VIEWER_QA_WORKFLOW.md` for local Scott scene QA.
Use `specs/KAIRO_PUBLIC_DEMO_CHECKLIST.md` for Pages and `.kairo` upload QA.

Key checks:

- toolbar readable at 1280 px
- `Fit scene`, `Fit main`, `Fit selected`, `Top 2D`, `3D`, `Orbit`
- Layers filter terms such as `7B` and `FOOTPRINT`
- Text `Auto` / `All` / `Off` and `Readable`
- exact entity picking after pan/zoom
- Workbench open/import/export smoke
- no uncaught browser console errors
