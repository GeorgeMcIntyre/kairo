# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

Phase 10T-B complete. TEXT and ATTDEF rendering live. Scott DXF2013: 244,953 → 245,922 entities (+969 text). 230 TEXT + 739 ATTDEF rendered as HTML overlay above the Three.js canvas. Validation passes. See TASK-019.

Warning breakdown (Scott DXF2013, post Phase 10T-B):
- DXF_BLOCK_PARTIAL_EXPAND: 160 (was 550 pre-Phase-10T-B — TEXT/ATTDEF no longer trigger partial-expand)
- DXF_INSERT_Z_FLATTENED: 140
- DXF_INSERT_MIRROR_FLATTENED: 132
- DXF_POLYLINE_SPLINE_APPROXIMATED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 0

---

## Remaining Blockers

| Blocker | Count | Notes |
|---|---|---|
| Depth-3+ nested INSERTs | 14 | Hit depth guard; increasing depth limit risks cycle explosion |
| Hatches, dimensions, splines | — | Not imported; design decision |
| MTEXT (formatted text) | 0 in Scott | Could add later if needed |
| ATTRIB (attribute overrides) | 0 in Scott | ATTDEF default is sufficient for Scott file |

---

## Options

| Option | Unlocks / Risk |
|---|---|
| Visual QA pass on text overlay | Confirm with George whether labels match reference; iterate on font/clamping if not |
| Mirror-aware text rotation | Optional — currently MIRRTEXT=0 semantics; switch to mirror-reflect if Scott shows backwards labels |
| TASK-004: CLI scene-stats command | Low risk, useful tooling |
| Hatch/dimension import | Medium risk; Scott file's missing dimensions noticeable in compare |
| Performance audit at full Scott zoom | Verify rAF projection cost holds at 245k+ entities |

**Recommended next:** Visual QA pass with George. If labels look right, the 245k-entity Scott layout is "feature complete" for 2D layout viewing — natural pause point. If labels are wrong (backwards under mirror, wrong size), do a small Phase 10T-C tune.

---

## Other Options (Lower Priority)

| Option | Unlocks | Risk |
|---|---|---|
| Depth-3+ nested INSERT expansion | 14 instances | Low value; depth guard exists for a reason |
| Non-uniform scale INSERT expansion | 0 in Scott DXF2013 | N/A for this file |
| Hatch/dimension import | Unknown | Medium |
