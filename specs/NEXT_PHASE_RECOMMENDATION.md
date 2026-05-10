# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

ISSUE-001, ISSUE-002, and ISSUE-003 complete. The Scott DXF2013 layout:
- Opens framing the facility (P95 robust bounds, A0 border excluded from initial fit)
- 246,045 supported entities, 1,092 text labels (TEXT + ATTDEF + MTEXT)
- Text anchors correct: 477 entities with non-default hAlign, 467 with non-default vAlign, 123 MTEXT with attachmentPoint
- Dark theme, hover highlight, dynamic picking tolerance, enriched properties panel
- Layer toggle, fit-scene, fit-main, fit-selected all working
- 201/201 tests pass. Typecheck and build clean.

Remaining inspection gap: raycaster resolves to the batched `THREE.LineSegments` node, not the individual DXF entity within the batch. Phase 10P performance batching is intact (~24 draw calls). The next step is granular entity resolution inside the batch.

POC readiness: ~78%.

---

## Warning Breakdown (Scott DXF2013, current)

| Warning code | Count |
|---|---|
| DXF_BLOCK_PARTIAL_EXPAND | 160 |
| DXF_INSERT_Z_FLATTENED | 140 |
| DXF_INSERT_MIRROR_FLATTENED | 132 |
| DXF_POLYLINE_SPLINE_APPROXIMATED | 15 |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 14 |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 0 |

---

## Recommended Priority Order

### 1 — Granular entity picking map after batching (P0, NOW)

**Problem:** Phase 10P merged many curve entities into ~24 batched `THREE.LineSegments` objects. Clicking resolves to the LineSegments node, not the individual DXF entity within the batch. To support click → inspect → exact entity workflows, we need a segment-index → entity ID map.

**Approach:** For each batched geometry document, build a lookup: `segmentStart..segmentEnd → { entityId, sourceRef, type, layerId }`. On raycast, use `intersection.index` (the hit vertex index from LineSegments) to resolve to the entity range. Store in `object.userData` alongside the existing RenderRecord.

**Invariants to preserve:**
- Do not undo batching. Do not revert to one Three.js object per entity.
- Do not rebuild on layer toggle, fit, or text changes.
- Keep ~24 draw calls.

**Deliverable:** Click any line/arc/circle → properties panel shows the correct DXF entity ID, sourceRef, type, and layer (not just the batch node).

---

### 2 — ISSUE-005: Mouse wheel zoom toward cursor (P1, NEXT)

Check if `controls.zoomToCursor = true` is supported by the installed OrbitControls version. If yes, one-line fix. If no, document the smallest safe custom approach without implementing it.

**Why:** High ergonomic value at very low code cost. Zooming into dense detail areas currently requires repeated pan-then-zoom cycles.

---

### 3 — ISSUE-004: Drawing-first viewer UI (P1, NEXT)

Maximize canvas space. Toolbar: Fit / Top2D / 3D / Fit-selected / Layers / Text / Diagnostics. Layers as the main side panel. Diagnostics collapsed by default. Tree panel optional/hidden by default.

**Why:** After geometry and text are correct, UI polish is the right investment for a demonstrable POC. The current development-tool layout is unsuitable for showing to stakeholders.

---

### 4 — Coordinate precision audit (P2, LATER)

Audit world-space coordinate precision for the Scott DXF. Facility coordinates are at ~116k mm; with single-precision float in Three.js this may cause rendering jitter. Check if the viewer needs double-precision workaround or coordinate recentering.

**Why:** Precision loss could explain any remaining geometry glitches at high zoom. Low investigation cost, potentially important before POC demos.

---

### 5 — Export/JT probe (P3, PARKED — research only)

Research only. Do not implement an exporter. Probe: what does the Siemens JT Open Toolkit require? Is there a WASM build? What is the license model?

**Why:** Keep visibility on the eventual export target without blocking current work on it.

---

## Lower Priority Options

| Option | Status | Rationale |
|---|---|---|
| ISSUE-006: Layer controls / isolate workflow | LATER | Useful for QA of large drawings; defer until picking and UI are done |
| ISSUE-007: Depth-3+ nested INSERT | LATER | Only 14 blocked instances; diminishing returns |
| ISSUE-008: Complex POLYLINE policy | LATER | Current approximation is documented and stable |
| ISSUE-009: Performance baseline | LATER | Current 5 s load acceptable; monitor before optimizing |
| ISSUE-010: QA workflow docs update | NEXT | Low cost; do alongside any issue above |
| ISSUE-012: Claude skills | NEXT | Useful for session consistency; low code risk |
| ISSUE-013: JT export | PARKED | Explicitly parked; do not start an exporter |

---

## What "Done" Looks Like After Priority 1-3

- Click any visible line/arc → see exact DXF entity ID, sourceRef, type, layer
- Mouse wheel zooms toward cursor position
- Canvas-dominant viewer layout; panels collapsible
- POC readiness estimate: ~88%

At that point, the Scott DXF2013 import is a genuinely demonstrable engineering POC ready for stakeholder review.
