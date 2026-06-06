# Viewer QA Workflow

Last updated: 2026-06-06

Repeatable manual QA workflow for the Kairo viewer on the primary Scott DXF scene. This is the local/full-scene complement to `specs/KAIRO_PUBLIC_DEMO_CHECKLIST.md`, which covers the slim Cloudflare Pages build and `.kairo` package upload path.

## Scope

Use this workflow for viewer behavior only:

- drawing-first toolbar layout
- panel open/close behavior
- layer search and isolate
- text density/readability controls
- exact batched-entity picking
- zoom-to-cursor and fit controls
- Workbench open/import/export smoke
- diagnostics visibility and current scene counts

Do not use this workflow to approve semantic training truth, CAD Exchanger/JT behavior, importer threshold changes, or production exporter claims.

## Baseline Commands

Run from the repo root:

```powershell
pnpm typecheck
pnpm test --run
pnpm --filter @kairo/viewer build
```

Expected current result:

```text
typecheck: clean
tests: 335 passed, 1 skipped generator
viewer build: clean, known Vite chunk-size warning only
```

## Scene Preparation

The staged Scott scene currently lives at:

```text
apps/viewer/public/scenes/scott-dxf2013-import
```

Validate it before browser QA:

```powershell
node packages\cli\dist\index.js validate apps\viewer\public\scenes\scott-dxf2013-import
```

Expected:

```text
0 errors
0 warnings
```

If regenerating from the source DXF, use the existing import/stage commands for the project and re-run validation before browser QA. Do not tune importer behavior during this viewer-only pass unless a specific viewer observation proves an importer bug.

## Current Scott Scene Counts

Use these as the expected diagnostics baseline.

| Metric | Expected |
|---|---:|
| Geometry documents | 28 |
| Curve entities | 244,953 |
| Text labels | 1,092 |
| Total curve/text entities | 246,045 |
| Scene nodes | 29 |
| Layers | 160 |
| Source-map rows | 246,046 |
| Validation report | 0 errors / 0 warnings |

Known warning buckets from the source import history:

| Warning Code | Count |
|---|---:|
| `DXF_BLOCK_PARTIAL_EXPAND` | 160 |
| `DXF_INSERT_Z_FLATTENED` | 140 |
| `DXF_INSERT_MIRROR_FLATTENED` | 132 |
| `DXF_POLYLINE_SPLINE_APPROXIMATED` | 15 |
| `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED` | 14 |
| `DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED` | 0 |

## Start Viewer

```powershell
pnpm --filter @kairo/viewer dev
```

Open:

```text
http://localhost:5173/?scene=scott-dxf2013-import
```

Use Chrome or Edge with DevTools Console open. At 1280 px viewport width, the toolbar should remain readable without horizontal page scroll.

## Drawing-First UI Checklist

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Scene load | Drawing appears; canvas is not blank; no scene-load error | |
| Toolbar at 1280 px | `Open DXF / Kairo`, `Load Demo Layout`, Fit controls, `Top 2D`, `3D`, `Orbit`, `Layers`, `Text`, `Semantics`, `Inspector`, `Workbench`, `Diagnostics` are readable | |
| Canvas dominance | Panels do not permanently consume the full viewport; closing panels restores drawing focus | |
| Layers toggle | Layers panel opens/closes without changing layer visibility state | |
| Semantics toggle | Semantics panel opens/closes without changing semantic overlay state | |
| Inspector toggle | Inspector opens/closes without clearing current selection | |
| Workbench toggle | Workbench opens/closes without canvas errors or resetting the scene | |
| Diagnostics toggle | Diagnostics opens/closes and shows validation plus viewport details | |

## Fit, View, And Navigation

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| `Fit scene` | Whole scene fits, including outlier-safe status text | |
| `Fit main` | Main drawing fills viewport without far outliers dominating | |
| `Top 2D` | Layout is flat and readable as a drawing | |
| `3D` | Perspective view activates without losing geometry | |
| `Orbit` | Orbit mode toggles in 3D only; returning to Top 2D remains usable | |
| Mouse wheel zoom | Zoom follows the cursor position closely enough for drawing review | |
| Pan | Panning remains responsive on the Scott scene | |
| `Fit selected` with no selected entity | No crash or blank canvas | |
| `Fit selected` after entity pick | Camera moves toward selected entity/batch and remains usable | |

## Exact Picking And Inspector

Pick several visible entities at different zoom levels.

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Line/polyline pick | Inspector changes from node selection to exact entity details | |
| Circle/arc pick | Inspector shows exact entity type when available | |
| Source ref | Source-map details are shown when available | |
| Layer field | Selected entity layer is visible and matches layer panel state | |
| Selection highlight | Selection highlight changes without a scene rebuild | |
| Pick after zoom/pan | Picking still resolves the clicked entity, not only the batch node | |

## Layer Controls And Isolate

Use real terms from the staged Scott scene. `ROBOT` is not a valid verification term for this asset because current layer names do not contain `ROBOT`.

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Filter `7B` | Matching layers are shown, or a clear zero-match state appears | |
| Filter `FOOTPRINT` | Matching layers are shown, or a clear zero-match state appears | |
| Clear filter | Full layer list returns to 160 layers | |
| Entity counts | Visible next to layer rows | |
| Per-layer `Show only` | Exactly one layer remains visible and isolate state is highlighted | |
| `Show all` | All layers become visible again | |
| `Hide all` | Drawing hides without breaking the app; `Show all` recovers | |
| Layer toggle after isolate | Individual visibility toggles still work | |

## Text And MTEXT

Use dense label regions and large station headers.

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Text `Auto` | Large headers remain visible while dense small annotations are reduced | |
| Text `All` | More labels appear without freezing the viewer | |
| Text `Off` | Text labels hide while geometry remains visible | |
| `Readable` enabled | Upside-down labels flip for readability without major anchor jumps | |
| `Readable` disabled | Original drawing orientation is visible | |
| MTEXT headers | Large station headers such as rack/load labels are visible where expected | |
| Dense label overlap | Note any areas where labels obscure drawing review | |
| Console | No new duplicate-key or runtime errors beyond already-known text-overlay warnings | |

## Diagnostics

Open Diagnostics after the scene settles.

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Validation | 0 errors / 0 warnings | |
| Scene counts | Counts align with the current Scott scene table above | |
| Viewport diagnostics | CSS size, canvas size, zoom, and draw-call details are visible | |
| Load timings | File/read/render/semantic timing rows are visible when available | |
| Semantic deferral | Geometry is visible before semantic analysis dominates interaction | |

## Workbench Smoke

This is not the human semantic review pass; it only proves the Workbench can open and preserve counts.

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Open Workbench | Panel opens without runtime errors | |
| Build Project Package | Review table populates with Scott records | |
| Import first-review fixture | `docs/examples/scott-p736-first-review.kairo-project.json` imports without schema errors | |
| Fixture counts | 116 records total: 28 accepted, 88 uncertain | |
| Export Project JSON | Downloads `kairo-project.json` | |
| Re-import exported JSON | Review state restores and counts remain stable | |

## `.kairo` Package Smoke

For public-demo package sharing, also run `specs/KAIRO_PUBLIC_DEMO_CHECKLIST.md`. Local package smoke can be run against the dev server:

```powershell
node packages\cli\dist\index.js pack-scene apps\viewer\public\scenes\scott-dxf2013-import tmp\scott-dxf2013-import.kairo
node packages\cli\dist\index.js validate tmp\scott-dxf2013-import.kairo --json
```

Then use `Open DXF / Kairo` or drag/drop `tmp\scott-dxf2013-import.kairo` into the viewer. Expected result: the Scott scene opens from the package without relying on the staged public scene URL.

## Failure Handling

If QA fails, record the exact failing row, URL, viewport size, browser, console error, and screenshot/reference note in `specs/KAIRO_TASKS.md` before changing code.

Only tune importer thresholds, semantic association, or text placement when a specific visual mismatch is proven. Keep viewer-only polish separate from importer/schema/exporter changes.
