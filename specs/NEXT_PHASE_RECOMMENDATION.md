# Next Phase Recommendation

Last updated: 2026-05-12

---

## Current Position

ISSUE-001, ISSUE-002, ISSUE-003, granular batched picking, zoom-to-cursor, semantic validation, the semantic label-to-geometry device MVP, advanced layout exports, `.kairo` package file support, viewer diagnostics, and the first Advanced Engineering Layout BOM workflow slice are complete on `codex/kairo-viewer-semantics` (`5a4ebb2` plus current uncommitted BOM workflow implementation). The Scott DXF2013 staged scene:

- Opens framing the facility with P95 robust bounds.
- Has 246,045 supported entities and 1,092 text labels.
- Uses 28 staged geometry documents and 160 layers; validation report is 0 errors / 0 warnings.
- Preserves Phase 10P batching: one `THREE.LineSegments` per geometry document.
- Resolves clicked line/polyline/circle/arc segments to exact DXF entity metadata in the properties panel.
- Supports mouse-wheel zoom toward cursor through `OrbitControls.zoomToCursor`.
- Keeps layer toggle, fit-scene, fit-main, fit-selected, text modes, and readable labels working.
- Extracts labels, classifies station/device/nest/dunnage-style labels with confidence and reasons, links labels to nearby block/geometry groups, and exposes linked/ambiguous/unlinked states.
- Provides session-only correction controls and JSON/Markdown semantic summary export.
- Provides an Advanced Engineering v0.2 Layout BOM model with lines, areas, stations, cells, devices, robot/device rows, nests, dunnage, foundation points, service zones, annotations, BOM rows, review items, and revision-ready stable keys.
- Provides compact workflow tabs for Layout Explorer, Device Inspector, Semantic Issues, Station/Cell Builder, Layout BOM Summary, Foundation Plan, Export Review, and Performance Diagnostics.
- Provides a browser-side CAD Exchanger GLB handoff export from Export Review. This writes GLB line/triangle primitives and keeps native JT export parked.
- Supports local `.dxf` import and `.kairo` package open/drop. `.kairo` packages are ZIP-backed neutral scene packages created with `pack-scene`.
- Includes lightweight performance diagnostics for browser DXF load stages, importer parse/build stages, semantic analysis, viewport batch build, render setup, and first render in the existing Diagnostics panel.
- Caps broad semantic overlay lists while preserving selected items, and keeps local DXF opens drawing-first by collapsing the Semantics panel by default.
- Passes `pnpm test` with 275/275 tests; `pnpm typecheck` and `pnpm build` are clean. The viewer build still reports the expected chunk-size warning.

POC readiness: ~89%.

---

## Warning Breakdown (Scott DXF2013, current)

| Warning code | Count |
|---|---:|
| DXF_BLOCK_PARTIAL_EXPAND | 160 |
| DXF_INSERT_Z_FLATTENED | 140 |
| DXF_INSERT_MIRROR_FLATTENED | 132 |
| DXF_POLYLINE_SPLINE_APPROXIMATED | 15 |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 14 |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 0 |

---

## Recommended Priority Order

### 1 - Manual QA: Layout BOM workflow panels (P1, NEXT)

Open the primary Scott DXF or `.kairo` package and verify the eight compact workflow panels are useful at real drawing scale. Record panel readability issues, wrong groupings, misleading BOM rows, and any missing high-value semantic item.

### 2 - ISSUE-020: `.kairo` package QA and sharing workflow (P1, NEXT)

Create a `.kairo` package from the primary Scott import, open it through the viewer on the shared test port, and confirm other domain users can load the package without staged public scene assets.

### 3 - ISSUE-019: Scott DXF semantic association QA pass (P1, NEXT)

Manually inspect high-value labels and linked geometry in the primary Scott DXF staged scene. Record false positives, ambiguous associations, and unlinked labels. Tune only proven thresholds, layer hints, or block-name hints.

### 4 - ISSUE-018: Persist reviewed semantic devices and overrides (P1, NEXT)

Add a small project-level semantic model for confirmed class overrides, geometry association overrides, unlinked labels, and warnings. Reload it with the staged scene so user corrections survive refresh/export.

### 5 - ISSUE-004: Drawing-first viewer UI (P1, NEXT)

Maximize canvas space. Toolbar: Fit / Top2D / 3D / Fit-selected / Layers / Text / Diagnostics. Layers should become the main side panel. Diagnostics should be collapsed by default. Tree panel should be optional or hidden by default.

### 6 - ISSUE-014: Text visual QA / alignment polish (P1, NEXT)

Manual CAD/browser QA is still needed for dense label areas. Fix only specific, proven placement/readability issues; otherwise record screenshots and keep importer/schema changes parked.

### 7 - ISSUE-015: Coordinate precision audit (P2, NEXT)

Audit world-space coordinate precision for the Scott DXF. Facility coordinates are at roughly 116k mm; with single-precision float in Three.js this may cause high-zoom jitter.

### 8 - ISSUE-016: Cloudflare deploy check (P1, NEXT)

Confirm Pages settings, local dist contents, `_redirects`, and staged scene payload. Use the CLI `stage-viewer-scene` command; there is no viewer `stage` script.

### 9 - ISSUE-017: CAD Exchanger GLB handoff validation (P2, NEXT)

Open the viewer-exported GLB in CAD Exchanger, export JT, then verify the JT in JT2Go / Process Simulate. Record scale, colors, line visibility, and text limitations.

---

## Lower Priority Options

| Option | Status | Rationale |
|---|---|---|
| ISSUE-006: Layer controls / isolate workflow | LATER | Useful after drawing-first UI |
| ISSUE-010: Fast viewer QA workflow documentation | LATER | Useful after the next browser QA pass |
| ISSUE-007: Depth-3+ nested INSERT | LATER | Only 14 blocked instances |
| ISSUE-008: Complex POLYLINE policy | LATER | Current approximation is documented and stable |
| ISSUE-009: Performance baseline | LATER | Current load is acceptable; monitor as scene size grows |
| ISSUE-012: Claude skills | LATER | Useful for session consistency; not part of immediate product QA |
| ISSUE-013: JT export | PARKED | Raw JT 8.1 spike failed/unreadable; use CAD Exchanger via GLB handoff only as a temporary bridge |

---

## What Done Looks Like After Priority 1-8

- `.kairo` package sharing works for the primary Scott layout.
- Layout BOM workflow panels pass manual readability/usefulness QA.
- Scott DXF semantic associations have a documented manual QA pass.
- Reviewed semantic corrections can be saved and reloaded.
- Canvas-dominant viewer layout with collapsible panels.
- Text visual QA notes are captured; any remaining alignment issues are labeled "needs manual QA."
- Coordinate precision has a written pass/fail recommendation.
- Cloudflare staging/deploy steps reference real commands.
- CAD Exchanger validation records whether the viewer-exported GLB converts to usable JT.
- POC readiness estimate: ~92%.
