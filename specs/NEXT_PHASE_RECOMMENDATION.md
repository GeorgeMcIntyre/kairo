# Next Phase Recommendation

Last updated: 2026-05-09

---

## Current Position

Phase 10L complete. Scott DXF2013 now imports 102,562 supported entities (up from 30,442 after Phase 10K).

Warning breakdown post-10L:
- DXF_BLOCK_PARTIAL_EXPAND: 310
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 132
- DXF_INSERT_Z_FLATTENED: 109 (new — z-offset inserts now expand)
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 108 (non-uniform/negative scale only)
- DXF_POLYLINE_UNSUPPORTED: 15

---

## Recommended: Phase 10M — One-Level Nested INSERT Expansion

**Status: NEXT (TASK-012)**

### What

Allow blocks containing one level of nested child INSERTs to expand supported geometry from those children. The parent INSERT's transform is composed with the child INSERT's transform.

- **Expand:** LINE, LWPOLYLINE, CIRCLE, ARC from child blocks (one level deep only)
- **Still skip:** grandchild INSERTs (no recursion)
- **New warning:** DXF_BLOCK_INSERT_NESTED_PARTIAL or similar if child block has unsupported content

### Expected impact

- 132 INSERT instances currently blocked by DXF_BLOCK_INSERT_NESTED_UNSUPPORTED may expand
- Equipment blocks (*U104, *U133, *U239, etc.) become visible
- Top parent blocks: *U104 (9 inserts), *U133 (6), *U239 (5)

### Risk

Medium. Requires transform composition (multiply matrices or apply in sequence). Requires careful handling of z-offset + nested z-offset combinations. No viewer changes needed.

---

## After Phase 10M — Ranked Options

| Rank | Phase | Unlocks | Risk |
|---|---|---|---|
| 1 (done) | 10K partial expansion | mixed blocks expand | Very low |
| 2 (done) | 10L z-offset support | 109 INSERT instances | Low |
| 3 | 10M one-level nested INSERT | ~132 INSERT instances | Medium |
| 4 | 10N POLYLINE spline-fit | 15 entities | Medium |
| 5 | Non-uniform/negative scale | ~108 INSERT instances | High — out of scope |
