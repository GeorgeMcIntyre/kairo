# Next Phase Recommendation

Last updated: 2026-05-09

---

## Current Position

Phase 10P complete. Viewer performance baseline established for 142,378-entity scenes.

Phase 10M complete. Scott DXF2013 imports 142,378 supported entities (up from 102,562 after Phase 10L).

Warning breakdown post-10M (unchanged by 10P — 10P is viewer-only):
- DXF_BLOCK_PARTIAL_EXPAND: 453
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 130 (non-uniform/negative scale only)
- DXF_INSERT_Z_FLATTENED: 110
- DXF_POLYLINE_UNSUPPORTED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14 (depth-3+ inserts — depth guard)

Viewer is ready to handle the next entity count increase without degradation.

---

## Recommended: Phase 10N — POLYLINE Spline-Fit Approximation

**Status: NEXT**

### What

Approximate the 15 spline-fit POLYLINE entities (DXF_POLYLINE_UNSUPPORTED) as piecewise line segments by sampling the fitted curve from the POLYLINE vertex data.

- **Target:** 15 COMPLEX_POLYLINE / spline-fit instances
- **Approach:** Use the POLYLINE fit vertices (group 10/20 vertex sequence) to produce an LWPOLYLINE-like chain

### Expected impact

- 15 spline-fit entities become importable
- DXF_POLYLINE_UNSUPPORTED drops to 0

### Risk

Medium. Spline-fit POLYLINE vertex semantics in DXF can vary; needs inspection of actual vertex data.

---

## After Phase 10N — Ranked Options

| Rank | Phase | Unlocks | Risk |
|---|---|---|---|
| 1 (done) | 10K partial expansion | mixed blocks expand | Very low |
| 2 (done) | 10L z-offset support | 109 INSERT instances | Low |
| 3 (done) | 10M one-level nested INSERT | ~132 INSERT instances | Medium |
| 4 | 10N POLYLINE spline-fit | 15 entities | Medium |
| 5 | Non-uniform/negative scale | ~130 INSERT instances | High — out of scope |
| 6 | Depth-3+ nested INSERT | 14 instances | Low value — out of scope |
