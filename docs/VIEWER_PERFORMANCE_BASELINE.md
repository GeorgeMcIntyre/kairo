# Viewer Performance Baseline

Date: 2026-06-06

## Scope

This baseline documents the current Scott DXF2013 viewer performance posture. It does not change viewer code.

Browser visual/performance QA was not rerun for this document because browser automation is not available in this session. The runtime timings below use the last recorded Phase 10P/diagnostics baseline from `specs/KAIRO_STATUS.md`; the payload and architecture notes were checked against the current staged scene and source files.

## Current Scene Size

Staged scene: `apps/viewer/public/scenes/scott-dxf2013-import`

| Metric | Value |
|---|---:|
| Geometry documents | 28 |
| Curve entities | 244,953 |
| Text labels | 1,092 |
| Total curve/text entities | 246,045 |
| Scene nodes | 29 |
| Layers | 160 |
| Source-map rows | 246,046 |
| Validation findings | 0 |

Static staged payload:

| Payload group | Files | Bytes | MiB |
|---|---:|---:|---:|
| Geometry JSON | 28 | 119,510,710 | 113.97 |
| Source map JSON | 1 | 87,957,324 | 83.88 |
| Full staged scene payload | 34 | 207,528,886 | 197.91 |

Largest geometry documents:

| File | Bytes |
|---|---:|
| `geom-layer-0-q-gencopa-curves.json` | 59,821,950 |
| `geom-layer-0-curves.json` | 16,943,257 |
| `geom-layer-section-curves.json` | 12,155,402 |
| `geom-layer-0-d-mach-prod-gage-curves.json` | 5,733,941 |
| `geom-layer-0-c-fen-curves.json` | 5,401,539 |
| `geom-layer-0-q-genprto-curves.json` | 5,213,703 |
| `geom-layer-e-ctry-flr-curves.json` | 3,739,526 |
| `geom-layer-outline-curves.json` | 2,690,916 |

## Current Rendering Architecture

The viewer keeps one `THREE.LineSegments` object per curve geometry document, not one object per entity. Current Scott therefore renders roughly 28 line batches for curve geometry.

Important implementation points:

- `apps/viewer/src/curveBatch.ts` converts line/polyline/circle/arc entities into a segment position array plus per-segment pick metadata.
- `apps/viewer/src/App.tsx` wraps each curve batch in one `THREE.BufferGeometry` and one `THREE.LineBasicMaterial`.
- Layer visibility toggles use `object.visible`; they do not rebuild geometry.
- Fit scene, fit main, fit selected, and selection highlight use cached records/material changes; they do not rebuild the full scene.
- Raycast picking intersects the batched objects and maps the returned segment index back to entity metadata.
- Cursor coordinate readout is throttled to avoid React updates on every pointer event.
- Semantic analysis is deferred after scene activation so geometry can appear before semantic computation finishes.
- Semantic overlay lists are capped while preserving the selected item.

## Current Runtime Baseline

Last recorded Phase 10P baseline:

| Metric | Baseline |
|---|---|
| Scene load time | Approximately 5 seconds for JSON fetch, parse, and Float32Array assembly |
| Draw calls | Approximately 28 curve draw calls |
| Layer toggle | No geometry rebuild |
| Fit scene / fit selected | No geometry rebuild |
| Selection highlight | No geometry rebuild |

The viewer now records timing stages for browser DXF loads and viewport setup:

- file read
- importer module load
- DXF import
- importer parse/import sub-stages when provided
- geometry batch build
- scene render setup
- first render ready
- semantic analysis

Those timings are visible in the Diagnostics panel, but they still require a manual browser run for current-machine numbers.

## Ranked Bottlenecks

1. JSON payload size and parse cost.
   The current staged scene is about 198 MiB uncompressed, dominated by geometry JSON and source-map JSON. If entity count grows, fetch/decompression/JSON.parse and memory pressure are more likely to hurt first load than raw draw calls.

2. Source-map payload and lookup strategy.
   The source map is about 84 MiB. It is useful for inspection, but it is large enough that lazy-loading or indexed lookup should be considered before adding more provenance-heavy features.

3. Geometry batch assembly.
   `createCurveBatchData` builds JavaScript arrays and then `Float32BufferAttribute` data. At larger counts, the next improvement is likely typed-array preallocation or a worker/off-main-thread batch build, not more Three.js objects.

4. Text and semantic overlays.
   Text labels and semantic overlays are DOM/React work layered on top of the canvas. Current caps help, but more labels or always-on semantic overlays could become the next interaction bottleneck.

5. Raycast picking.
   Picking is acceptable with batched objects, but line raycasting still tests segment-heavy buffers. If interaction slows at larger counts, the next step is a spatial index or layer/entity subset picking, not per-entity Three.js objects.

6. GPU draw calls.
   Current draw-call count is low. GPU draw submission is not the first suspected bottleneck until geometry documents or materials multiply substantially.

## Next Optimization Step

If the scene grows meaningfully beyond the current Scott baseline, optimize in this order:

1. Add a manual Diagnostics capture to record current browser timings for `.kairo` open and raw DXF open.
2. Avoid loading `source-map.json` until the user opens Inspector or selects an entity that needs source details.
3. Consider packaging geometry in a smaller binary or chunked format for `.kairo` and internal sharing.
4. Preallocate typed arrays in `createCurveBatchData` or move batch assembly to a worker if `geometry-batch-build` dominates.
5. Add a spatial picking index only if raycast timing becomes visibly slow.

Renderer rewrite is not justified by the current baseline.

## Performance Invariants

Do not violate these without a measured regression and explicit approval:

- No one Three.js object per curve entity.
- No one material per curve entity.
- No full scene rebuild on layer toggle, fit, hover, or selection.
- No always-on full semantic overlay for all 1,000+ labels when the view is zoomed out.
- No public Pages deployment of the full 198 MiB staged Scott payload; use `.kairo` packages for sharing large scenes.

## Manual QA Gate

For the next performance pass, collect the Diagnostics panel timings from:

- local staged scene load
- `.kairo` file open
- raw DXF file open, if needed
- layer isolate on a large layer such as `0-Q-GENCOPA`
- exact pick on dense geometry
- text density Auto and All

Record browser, machine, viewport size, and whether DevTools was open.
