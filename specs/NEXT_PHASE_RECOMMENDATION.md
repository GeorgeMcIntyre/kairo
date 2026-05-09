# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

Phase 10N-A complete. Parser investigation confirmed: `@dxfjs/parser` exposes VERTEX group 70 flags; Phase 10N-B is viable.

Phase 10P complete. Viewer performance baseline established for 142,378-entity scenes.

Phase 10M complete. Scott DXF2013 imports 142,378 supported entities (up from 102,562 after Phase 10L).

Warning breakdown post-10M (unchanged by 10P and 10N-A — both viewer-only or investigation-only):
- DXF_BLOCK_PARTIAL_EXPAND: 453
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 130 (non-uniform/negative scale only)
- DXF_INSERT_Z_FLATTENED: 110
- DXF_POLYLINE_UNSUPPORTED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14 (depth-3+ inserts — depth guard)

Viewer is ready to handle the next entity count increase without degradation.

---

## Recommended: Phase 10N-B — POLYLINE Spline-Fit Expansion

**Status: NEXT — approved to implement**

### What

Expand the 15 spline-fit POLYLINE entities (DXF_POLYLINE_UNSUPPORTED) as piecewise line segments by collecting the `flag & 8` vertices (spline vertices pre-sampled by AutoCAD onto the fitted curve).

- **Target:** 15 COMPLEX_POLYLINE / spline-fit instances
- **Approach:** For POLYLINE with `flag & 4` (spline-fit): collect vertices where `flag & 8` and `!(flag & 16)` as the output point chain; treat as a closed/open polyline matching the POLYLINE closed flag.
- **No B-spline math.** AutoCAD has already sampled the curve; the `flag & 8` vertices are the ready result.
- **Skip:** `flag & 16` vertices are frame control points — not on the fitted curve.

### Confirmed by Phase 10N-A

- `@dxfjs/parser` maps group 70 → `VertexEntity.flag`; values 8 and 16 are preserved (test verified).
- Diagnostic test committed as permanent regression guard.
- See ADR-010.

### Expected impact

- 15 spline-fit entities become importable.
- DXF_POLYLINE_UNSUPPORTED drops to 0.
- ~15 additional curve entities in viewer — negligible performance impact at current scale.

### Risk

Low-Medium. The pre-sampled vertex approach avoids B-spline math. Risk is that some DXF writers may not write `flag & 8` vertices (they write only control frame). Mitigation: if no `flag & 8` vertices are found, fall back to skipping with a refined warning rather than DXF_POLYLINE_UNSUPPORTED.

---

## After Phase 10N-B — Ranked Options

| Rank | Phase | Unlocks | Risk |
|---|---|---|---|
| 1 (done) | 10K partial expansion | mixed blocks expand | Very low |
| 2 (done) | 10L z-offset support | 109 INSERT instances | Low |
| 3 (done) | 10M one-level nested INSERT | ~132 INSERT instances | Medium |
| 4 (done) | 10N-A parser investigation | confirms 10N-B viable | None |
| 5 | 10N-B POLYLINE spline-fit | 15 entities | Low-Medium |
| 6 | Non-uniform/negative scale | ~130 INSERT instances | High — out of scope |
| 7 | Depth-3+ nested INSERT | 14 instances | Low value — out of scope |
