# Kairo DXF Load Performance Review

Last updated: 2026-05-12

## Current Pipeline

Browser DXF upload path:

1. `File.text()` reads the DXF.
2. `@kairo/importer-dxf/browser` is lazy-loaded only when a DXF is opened.
3. `importDxfTextToKairo()` parses DXF, pre-cleans input, extracts direct MTEXT, normalizes supported geometry/text, expands supported INSERT chains, and emits a neutral `ScenePackage`.
4. Viewer activates the scene package immediately after import.
5. Semantic analysis is deferred by a short timer so the drawing can render first.
6. Viewport builds one batched `THREE.LineSegments` object per curve geometry document with segment-level pick metadata.
7. Text labels are projected through the HTML overlay and controlled by Auto / All / Off density.
8. Semantic overlay is opt-in and capped for broad station/device/unknown lists while preserving selected items.

## Performance Findings

- Measured Scott DXF benchmark file: `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf`.
- Before the 2026-05-12 hot-path fix, Node importer load was `62.4 s`; `scene-package-build` alone was `59.1 s`.
- After replacing quadratic layer grouping with in-place append, Node importer load is `4.6 s`; `scene-package-build` is `1.0 s`.
- Importer-only speedup is about `13.5x` overall, with the package-build stage about `58.8x` faster.
- DXF pre-clean, parse, MTEXT scan, and validation now dominate raw importer time.
- Importer module loading is already lazy, so bundled sample and `.kairo` package opens avoid DXF parser cost.
- Geometry batching is correctly preserved. The viewer does not create one Three.js object per DXF entity.
- Picking remains exact because each batched segment keeps `CurveSegmentPickEntry` metadata.
- Semantic analysis is no longer on the critical first-render path.
- Semantic/text panels are list-capped and selection-driven; they do not render all semantic rows at once.
- Text overlay remains the highest visual-density risk, but Auto mode limits tiny labels at fit-scene scale.
- The new GLB export is explicit user action only. It does not run during DXF load, scene activation, picking, or camera movement.

## Current Timing Coverage

Available in Diagnostics / Performance panel:

- file read
- importer module load
- DXF import total
- importer parse/build stages from `importerCore`
- browser DXF load total
- semantic analysis
- geometry batch build
- scene render setup
- first render ready
- viewport size, DPR, camera zoom, fit bounds

Local benchmark command:

```powershell
$env:KAIRO_DXF_BENCHMARK_FILE="C:\Users\georgem\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf"
pnpm exec vitest run tests/dxfLoadBenchmark.test.ts --reporter verbose
```

Latest benchmark:

| Stage | Before | After |
| --- | ---: | ---: |
| file-read | 25 ms | 27 ms |
| pre-clean | 1,393 ms | 1,468 ms |
| dxf-parse | 802 ms | 857 ms |
| mtext-scan | 387 ms | 437 ms |
| scene-package-build | 59,062 ms | 1,005 ms |
| validation | 712 ms | 830 ms |
| total-import | 62,357 ms | 4,598 ms |

## Performance Invariants

- Keep one `THREE.LineSegments` per curve geometry document.
- Do not create one object, material, React node, or DOM popup per DXF entity.
- Do not run semantic classification synchronously before first scene activation.
- Do not render every text label in a large drawing unless the user explicitly chooses All.
- Do not include GLB/JT/CAD Exchanger work in the initial DXF load path.
- Preserve segment-level metadata for exact picking.

## Remaining Bottlenecks To Watch

- Raw DXF parser cost on very large files.
- JSON/neutral scene object allocation during DXF import.
- `pointsForEntity()` tessellation cost for arcs/circles during viewport batch build and GLB export.
- Semantic geometry-group construction over large curve sets.
- Dense text overlay projection when users force Labels = All.
- GLB export memory use for very large drawings because GLB must assemble binary buffers before download.

## Recommendations

1. Keep `.kairo` package sharing as the preferred repeat-load path for internal review.
2. Add a web worker for raw DXF import only if UI blocking remains a problem after manual timing on the Scott layout.
3. Cache semantic analysis by scene package identity and override map if repeated recalculation becomes visible.
4. Keep GLB export as manual export, then use CAD Exchanger for JT conversion.
5. Do not attempt browser-side JT export.
