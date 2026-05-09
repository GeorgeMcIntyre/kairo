# Next Phase Recommendation

Last updated: 2026-05-09

---

## Current Position

Phase 10J audit complete. Full missing-geometry data is in `specs/SCOTT_DXF_MISSING_GEOMETRY_AUDIT.md`.

George confirmed the viewer is usable (top-2D, fit, lines, layers). The largest gap is geometry that exists inside blocks but is blocked by whole-block rejection when the block contains any unsupported entity type (ATTDEF, TEXT, SPLINE, etc.).

**602 total INSERT instances. Only 32 (5.3%) are currently being expanded.**

---

## Recommended: Phase 10K — Partial Block Expansion

**Status: In progress (TASK-010)**

### What

Change `blockUnsupportedEntityTypes` rejection from "whole block blocked if any unsupported type present" to "expand supported entities, skip and warn about unsupported entities within the same block".

Specifically:
- **Expand:** LINE, LWPOLYLINE, CIRCLE, ARC, simple POLYLINE from any block (regardless of other content)
- **Skip and warn:** ATTDEF, TEXT, SPLINE, ELLIPSE, POINT, COMPLEX_POLYLINE within the block
- **Still fully skip (whole INSERT):** blocks containing nested INSERTs
- **New warning code:** `DXF_BLOCK_PARTIAL_EXPAND` — lists skipped entity types and counts per block instance

### Expected impact

- Scott DXF2013: supported entity count rises from 13,711 by several thousand
- DXF_BLOCK_UNSUPPORTED_CONTENT (233 warnings) drops to near zero
- FENC fence panels (70 inserts of FENC-1525 alone) become visible
- Equipment blocks (*U36, *U48, controllers, etc.) become visible

### Risk

Very low. No new geometry types. No new transform math. No viewer changes. Only the block rejection policy changes.

---

## After Phase 10K — Ranked Options

| Rank | Phase | Unlocks | Risk |
|---|---|---|---|
| 1 (done) | 10K partial expansion | ~232 INSERT instances | Very low |
| 2 | 10L z-offset support | ~109 INSERT instances | Low |
| 3 | 10M one-level nested INSERT | ~138 INSERT instances | Medium |
| 4 | 10N POLYLINE spline-fit | 30 entities | Medium |
| 5 | Non-uniform/negative scale | ~108 INSERT instances | High — out of scope |
