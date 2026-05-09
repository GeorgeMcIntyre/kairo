# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

Phase 10R-A complete. Transform complexity audit run against Scott DXF2013. See TASK-017-PREP and KAIRO_STATUS.md Phase 10R-A section.

Phase 10O-A complete. Text/attribute/equipment audit run against Scott DXF2013. See TASK-016.

Phase 10N-B complete. Spline-fit POLYLINE expansion: 15 entities, DXF_POLYLINE_UNSUPPORTED → 0.

Phase 10P complete. Viewer performance baseline established for 142,393-entity scenes.

Warning breakdown (current, post Phase 10N-B):
- DXF_BLOCK_PARTIAL_EXPAND: 453
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 130 (non-uniform/negative scale only)
- DXF_INSERT_Z_FLATTENED: 110
- DXF_POLYLINE_SPLINE_APPROXIMATED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14 (depth-3+ inserts — depth guard)

---

## Recommended: Phase 10S — Negative X Mirror INSERT Expansion

**Status: NEXT — ready to implement**

### What

Phase 10R-A audit showed: ALL 108 top-level hard-blocked INSERTs (of the 130 total DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED) are pure X-axis mirrors. The two patterns:
- `xScale=-25.4, yScale=25.4, zScale=25.4` — imperial-to-metric with X-flip
- `xScale=-1, yScale=1, zScale=1` — simple X mirror

**Approach:** When `isNegativeUniformMirror(insert)` (uniform abs magnitudes, at least one axis negative), expand with `abs(scale)` and negate coordinates on mirrored axes. Emit `DXF_INSERT_MIRROR_FLATTENED` warning.

**Expected impact:** ~108+ inserts unlocked; significant geometry gain (FENC-1525 × 35 has large geometry, SPR-CNT_TM_RIP × 9, etc.).

**Risk:** Low. Single-axis X flip with uniform magnitude is the simplest mirror case. Geometry topology is preserved. For 2D inspection, mirrored layout is acceptable.

---

## Ranked Options After Phase 10R-A

| Rank | Phase | Unlocks | Risk |
|---|---|---|---|
| 1 (done) | 10K partial expansion | mixed blocks expand | Very low |
| 2 (done) | 10L z-offset support | 109 INSERT instances | Low |
| 3 (done) | 10M one-level nested INSERT | ~132 INSERT instances | Medium |
| 4 (done) | 10N-B POLYLINE spline-fit | 15 entities | Low-Medium |
| 5 (done) | 10R-A transform audit | findings only | None |
| 6 | **10S negative X mirror** | ~108+ INSERTs | Low |
| 7 | Non-uniform XY (Option B) | 0 in Scott DXF2013 | N/A |
| 8 | Depth-3+ nested INSERT | 14 instances | Low value — out of scope |
