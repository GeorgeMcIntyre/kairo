# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

Phase 10T-C complete. MTEXT scanner added — 343 MTEXT records previously silently dropped from Scott DXF2013 are now imported. Large station headers (e.g. "7B-070L RACK LOAD" at 457.2 mm) are visible. Label density modes (Auto/All/Off) and readable orientation toggle added. Text entity count: 969 → 1092 (+123 MTEXT). 151/151 tests pass.

Warning breakdown (Scott DXF2013, post Phase 10T-C):
- DXF_BLOCK_PARTIAL_EXPAND: 160
- DXF_INSERT_Z_FLATTENED: 140
- DXF_INSERT_MIRROR_FLATTENED: 132
- DXF_POLYLINE_SPLINE_APPROXIMATED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 0

POC readiness: ~70%. Geometry, layers, and text are largely in place. Remaining gaps are in inspection ergonomics and viewer polish.

---

## Visual QA State

The Scott DXF2013 layout is usable but not polished. Known issues:
- 5,506 outlier entities visible away from the main drawing (cause unclassified)
- Text alignment approximate (horizontal/vertical alignment group codes not honored)
- Selection shows minimal entity details — not practical for diagnosis
- Viewer UI is development-oriented; panels dominate over canvas
- Mouse wheel zoom is center-of-viewport, not toward cursor

---

## Recommended Priority Order

### 1 — ISSUE-001: Outlier/floater audit (P0, NOW)

Run `scene-outliers` and classify the 5,506 outliers. Phase 10T-A confirmed top-6 are mathematically correct (far-field equipment). The full set is unclassified. Goal: confirm there are no remaining transform bugs before investing in viewer polish.

**Why first:** Low cost, provides confidence, blocks clearer roadmap decisions. If outliers are bugs → fix before UI work. If they are correct → document and move on.

---

### 2 — ISSUE-002: Selection and inspection usability (P0, NEXT)

George's primary review workflow is: click entity → understand what it is → decide if it's right. Current selection works but shows minimal details. This is the single highest-leverage viewer improvement for diagnosing the remaining visual gaps.

**Why second:** Everything downstream (text, layers, outliers) is easier to diagnose once selection is practical.

---

### 3 — ISSUE-003: Text placement and alignment correctness (P0, NEXT)

TEXT horizontal alignment (left/center/right), vertical alignment (top/middle/base/bottom), and MTEXT attachment point are approximate. Labels are visible but not at their correct DXF positions.

**Why third:** Alignment is relatively contained (group code parsing + overlay positioning math). Natural follow-on to selection work.

---

### 4 — ISSUE-004: Viewer UI drawing-first review mode (P1, NEXT)

Maximize canvas space, add toolbar, make layers the primary panel, collapse diagnostics. The viewer currently looks like a development tool — it needs to look like a drawing viewer.

**Why fourth:** After geometry and text are correct, UI polish is the right next investment for making the POC demonstrable.

---

### 5 — ISSUE-005: Mouse wheel zoom toward cursor (P1, NEXT)

Check if `controls.zoomToCursor = true` is supported by the installed OrbitControls version. If yes, it is a one-line fix. If no, document the smallest safe custom approach.

**Why fifth:** High ergonomic value, likely very low cost to implement.

---

### 6 — ISSUE-006: Layer controls and isolate workflow (P1, NEXT)

Layer search, isolate, show all, entity counts. Needed for visual QA of large drawings where dozens of layers overlap.

**Why sixth:** Natural companion to drawing-first UI. Can be done incrementally alongside or after ISSUE-004.

---

## Lower Priority Options

| Option | Status | Rationale |
|---|---|---|
| ISSUE-007: Depth-3+ nested INSERT | LATER | Only 14 blocked instances; diminishing returns |
| ISSUE-008: Complex POLYLINE policy | LATER | Current approximation is documented and stable |
| ISSUE-009: Performance baseline | LATER | Current 5 s load is acceptable; monitor before optimizing |
| ISSUE-010: QA workflow docs update | NEXT | Low cost; do alongside any issue above |
| ISSUE-012: Claude skills | NEXT | Useful for session consistency; low code risk |
| ISSUE-013: JT export | PARKED | Explicitly parked; do not start |

---

## What "Done" Looks Like After This Phase

After ISSUE-001 through ISSUE-006:
- No unclassified outliers with unknown cause
- Click any visible entity → see layer/type/handle/source chain
- Text labels are approximately at their correct DXF positions
- Viewer canvas dominates; panels are secondary
- Mouse wheel zooms toward cursor
- Layers are easy to isolate and restore
- POC readiness estimate: ~80%

At that point, the Scott DXF2013 import is a genuinely demonstrable engineering POC.
