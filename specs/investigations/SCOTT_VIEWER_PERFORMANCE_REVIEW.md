# Scott Viewer Performance Review

Date: 2026-05-14
Branch: `codex/kairo-viewer-semantics-integrated`

## Scope

Primary target: `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf`

Observed local file size: 38,496,788 bytes.

This review covers browser/local viewer loading behavior, staged-scene semantic analysis, and post-load UI work. It does not claim visual geometry correctness and does not start DXF block-instance extraction.

## Current Load Pipeline

Local DXF open currently runs these timed stages:

1. `file-read`
2. `importer-module-load`
3. `dxf-import`
4. `pre-clean`
5. `dxf-parse`
6. `mtext-scan`
7. `scene-package-build`
8. `validation`
9. `total-import`
10. `browser-dxf-load-total`

Viewport diagnostics also report `scene-render-setup` and `first-render-ready`. Semantic diagnostics report `semantic-analysis`.

The Scott staged semantic machine QA test loads the staged scene and runs robust bounds, semantic analysis, overrides, and QA report generation in roughly 5.3-5.6 seconds on this machine during Vitest. This is not a browser DXF-import timing, but it confirms semantic-side work is large enough to treat as a first-class performance stage.

## Implemented Performance/UX Changes

- Loading is now explicit app state instead of inferred from `sceneStatus` text.
- The new file is not marked active until scene activation succeeds.
- During loading, the previous/sample canvas and text overlay are hidden behind the normal dark CAD grid.
- The loading card shows file name, current phase, elapsed time, and an indeterminate progress bar.
- Local file loading emits progress phases for file read, importer module load, DXF import, and Kairo package read.
- Browser DXF import now runs in a module Web Worker when `Worker` is available, with the direct importer kept as the Node/test fallback.
- Semantic analysis now runs in a module Web Worker when `Worker` is available, with the direct analyzer kept as the Node/test fallback.
- Importer layer grouping was changed from repeated array cloning to in-place layer bucket appends. On the primary Scott DXF, the Node importer baseline before output writing dropped from roughly 72.9 seconds to roughly 4.5 seconds on this machine.
- Public scene loading emits progress phases for manifest and geometry reads.
- Heavy semantic export artifacts are computed only when requested:
  - semantic summary export
  - Scott semantic QA Markdown
  - semantic review JSON
  - advanced layout exports
- The always-visible semantic counts now use a lightweight count model instead of building the full semantic summary during every load/render.

## Remaining Performance Risks

- Large semantic validation and overlay work is still proportional to detected semantic item count when the Semantics panel or overlay is active.
- The browser must still build Three.js curve batches for all staged geometry documents before first render.
- Transferring the imported scene package and semantic result between workers and the UI thread may still take noticeable time on very large DXFs.
- Full browser timing still needs to be captured after the importer grouping fix because Chrome/Vite/browser structured clone timing can differ from the Node importer baseline.

## Next Recommendation

Use the viewer Diagnostics panel on `http://127.0.0.1:5194/` with the primary Scott DXF and record:

- `browser-dxf-load-total`
- `dxf-parse`
- `scene-package-build`
- `validation`
- `scene-render-setup`
- `first-render-ready`
- `semantic-analysis`

If scene activation, worker result transfer, or viewport batch creation still blocks interaction for an unacceptable period, the next implementation should move scene activation preparation into a chunked pipeline and investigate transferable compact geometry buffers.
