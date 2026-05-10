# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

ISSUE-001, ISSUE-002, ISSUE-003, granular batched picking, and zoom-to-cursor are complete in the current working tree. The Scott DXF2013 layout:

- Opens framing the facility with P95 robust bounds.
- Has 246,045 supported entities and 1,092 text labels.
- Preserves Phase 10P batching: one `THREE.LineSegments` per geometry document.
- Resolves clicked line/polyline/circle/arc segments to exact DXF entity metadata in the properties panel.
- Supports mouse-wheel zoom toward cursor through `OrbitControls.zoomToCursor`.
- Keeps layer toggle, fit-scene, fit-main, fit-selected, text modes, and readable labels working.
- Passes `pnpm test -- --minWorkers=1 --maxWorkers=1` with 206/206 tests; `pnpm typecheck` and `pnpm build` are clean.

POC readiness: ~84%.

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

### 1 - ISSUE-004: Drawing-first viewer UI (P1, NEXT)

Maximize canvas space. Toolbar: Fit / Top2D / 3D / Fit-selected / Layers / Text / Diagnostics. Layers should become the main side panel. Diagnostics should be collapsed by default. Tree panel should be optional or hidden by default.

### 2 - ISSUE-010: Fast viewer QA workflow documentation (P1, NEXT)

Update `specs/VIEWER_QA_WORKFLOW.md` with current entity counts, text modes, exact picking, zoom-to-cursor, the CLI staging command, and the constrained-worker test command.

### 3 - Coordinate precision audit (P2, LATER)

Audit world-space coordinate precision for the Scott DXF. Facility coordinates are at roughly 116k mm; with single-precision float in Three.js this may cause high-zoom jitter.

### 4 - Export/JT probe (P3, PARKED - research only)

Research only. Do not implement an exporter. First prove CAD Exchanger behavior with a small GLB probe covering LINES, LINE_STRIP, TRIANGLES, TRIANGLE_STRIP, mesh ribbon fallback, material/layer preservation, and coordinate precision.

---

## Lower Priority Options

| Option | Status | Rationale |
|---|---|---|
| ISSUE-006: Layer controls / isolate workflow | LATER | Useful after drawing-first UI |
| ISSUE-007: Depth-3+ nested INSERT | LATER | Only 14 blocked instances |
| ISSUE-008: Complex POLYLINE policy | LATER | Current approximation is documented and stable |
| ISSUE-009: Performance baseline | LATER | Current load is acceptable; monitor as scene size grows |
| ISSUE-012: Claude skills | NEXT | Useful for session consistency; low code risk |
| ISSUE-013: JT export | PARKED | Do not start without explicit re-authorization |

---

## What Done Looks Like After Priority 1-2

- Canvas-dominant viewer layout with collapsible panels.
- Current browser QA steps documented and repeatable.
- Cloudflare staging/deploy steps reference real commands.
- POC readiness estimate: ~88%.
