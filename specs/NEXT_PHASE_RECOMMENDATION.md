# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

Phase 10S complete. All 130 `DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED` warnings resolved. Scott DXF2013 entity count: 142,393 → 244,953 (+102,560). See TASK-017 and KAIRO_STATUS.md.

Warning breakdown (current, post Phase 10S):
- DXF_BLOCK_PARTIAL_EXPAND: 550
- DXF_INSERT_Z_FLATTENED: 140
- DXF_INSERT_MIRROR_FLATTENED: 132
- DXF_POLYLINE_SPLINE_APPROXIMATED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14 (depth-3+ inserts — depth guard)
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 0 (all resolved)

---

## Remaining Blockers

| Blocker | Count | Notes |
|---|---|---|
| Depth-3+ nested INSERTs | 14 | Hit depth guard; increasing depth limit risks cycle explosion |
| Hatches, dimensions, splines | — | Not imported; design decision |
| Text/ATTDEF geometry | — | Not rendered; by design |

---

## Options

| Rank | Option | Unlocks | Risk |
|---|---|---|---|
| 1 | Depth-3+ nested INSERT expansion | 14 instances | Low value; depth guard exists for a reason |
| 2 | Non-uniform scale INSERT expansion | 0 in Scott DXF2013 | N/A for this file |
| 3 | TASK-004: CLI scene-stats command | Developer QA tooling | Low; reuses existing `sceneStats.ts` |
| 4 | Hatch/dimension import | Unknown entities | Medium |

**Low-value remaining:** With 0 hard-blocked INSERTs and only 14 depth-guard hits, the import pipeline is near its practical ceiling for the Scott DXF2013 file. Future gains require either deeper nesting support (low value) or new entity type support.

**Recommended next:** TASK-004 (CLI scene-stats command) — low risk, useful for import QA, reuses existing viewer logic.
