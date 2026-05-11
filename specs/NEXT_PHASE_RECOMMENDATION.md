# Next Phase Recommendation

Last updated: 2026-05-11

---

## Current Position

ISSUE-001, ISSUE-002, ISSUE-003, granular batched picking, zoom-to-cursor, semantic validation, and the semantic label-to-geometry device MVP are complete on `codex/kairo-viewer-semantics` (`5751b35` plus current uncommitted implementation). The Scott DXF2013 staged scene:

- Opens framing the facility with P95 robust bounds.
- Has 246,045 supported entities and 1,092 text labels.
- Uses 28 staged geometry documents and 160 layers; validation report is 0 errors / 0 warnings.
- Preserves Phase 10P batching: one `THREE.LineSegments` per geometry document.
- Resolves clicked line/polyline/circle/arc segments to exact DXF entity metadata in the properties panel.
- Supports mouse-wheel zoom toward cursor through `OrbitControls.zoomToCursor`.
- Keeps layer toggle, fit-scene, fit-main, fit-selected, text modes, and readable labels working.
- Extracts labels, classifies station/device/nest/dunnage-style labels with confidence and reasons, links labels to nearby block/geometry groups, and exposes linked/ambiguous/unlinked states.
- Provides session-only correction controls and JSON/Markdown semantic summary export.
- Passes `pnpm.cmd test -- --minWorkers=1 --maxWorkers=1` with 245/245 tests; `pnpm.cmd typecheck` and `pnpm.cmd build` are clean. The viewer build still reports the expected chunk-size warning.

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

### 1 - ISSUE-019: Scott DXF semantic association QA pass (P1, NEXT)

Manually inspect high-value labels and linked geometry in the primary Scott DXF staged scene. Record false positives, ambiguous associations, and unlinked labels. Tune only proven thresholds, layer hints, or block-name hints.

### 2 - ISSUE-018: Persist reviewed semantic devices and overrides (P1, NEXT)

Add a small project-level semantic model for confirmed class overrides, geometry association overrides, unlinked labels, and warnings. Reload it with the staged scene so user corrections survive refresh/export.

### 3 - ISSUE-004: Drawing-first viewer UI (P1, NEXT)

Maximize canvas space. Toolbar: Fit / Top2D / 3D / Fit-selected / Layers / Text / Diagnostics. Layers should become the main side panel. Diagnostics should be collapsed by default. Tree panel should be optional or hidden by default.

### 4 - ISSUE-014: Text visual QA / alignment polish (P1, NEXT)

Manual CAD/browser QA is still needed for dense label areas. Fix only specific, proven placement/readability issues; otherwise record screenshots and keep importer/schema changes parked.

### 5 - ISSUE-015: Coordinate precision audit (P2, NEXT)

Audit world-space coordinate precision for the Scott DXF. Facility coordinates are at roughly 116k mm; with single-precision float in Three.js this may cause high-zoom jitter.

### 6 - ISSUE-016: Cloudflare deploy check (P1, NEXT)

Confirm Pages settings, local dist contents, `_redirects`, and staged scene payload. Use the CLI `stage-viewer-scene` command; there is no viewer `stage` script.

### 7 - ISSUE-017: CAD Exchanger GLB primitive probe (P2, NEXT - research only)

Research only. Do not implement an exporter. First prove CAD Exchanger behavior with a small GLB probe covering LINES, LINE_STRIP, TRIANGLES, TRIANGLE_STRIP, mesh ribbon fallback, material/layer preservation, and coordinate precision.

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
| ISSUE-013: JT export | PARKED | Do not start without explicit re-authorization |

---

## What Done Looks Like After Priority 1-7

- Scott DXF semantic associations have a documented manual QA pass.
- Reviewed semantic corrections can be saved and reloaded.
- Canvas-dominant viewer layout with collapsible panels.
- Text visual QA notes are captured; any remaining alignment issues are labeled "needs manual QA."
- Coordinate precision has a written pass/fail recommendation.
- Cloudflare staging/deploy steps reference real commands.
- CAD Exchanger probe results identify which GLB primitives and metadata survive import.
- POC readiness estimate: ~92%.
