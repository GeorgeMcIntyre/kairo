# Scott DXF Missing Geometry Audit

File: `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf`  
Audit date: 2026-05-09  
Kairo HEAD: `744d679 test: add dxf insert rotation coverage`

---

## 1. Current Import Summary

| Metric | Value |
|---|---|
| Supported entities imported | 13,711 |
| Unsupported entities (warnings) | 585 |
| Layers | 160 |
| Geometry documents | 12 |
| Pre-clean ACAD_REACTORS removed | 8,026 |
| Output size | 12 MB |
| Validation | PASSED — 0 errors |
| Viewer URL | http://localhost:5173/?scene=scott-dxf2013-import |

George confirmed the viewer is usable: top-2D works, fit works, lines visible, layers/counts show. Significant geometry and symbol detail is still missing.

---

## 2. Unsupported INSERT Audit

### Warning code breakdown

| Warning code | Count | Cause |
|---|---|---|
| DXF_BLOCK_UNSUPPORTED_CONTENT | 233 | Block contains unsupported entity types → entire INSERT skipped |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 217 | Non-uniform scale, negative scale, or z offset |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 120 | Block contains child INSERT entities |
| DXF_POLYLINE_UNSUPPORTED | 15 | POLYLINE with spline-fit flag (not simple vertex chain) |

### inspect-dxf safe expansion classification (602 total INSERT instances)

| Classification | Count | % |
|---|---|---|
| safe now (already being expanded) | 32 | 5.3% |
| safe after POLYLINE support | 1 | 0.2% |
| blocked by nested INSERT | 138 | 22.9% |
| blocked by unsupported entity types | 232 | 38.5% |
| blocked by transform complexity | 199 | 33.1% |
| missing block definition | 0 | 0% |

Total block definitions: 307. Unique inserted block names: 214. Missing block definitions: 0.

---

## 3. Block Definition Audit — Unsupported Content Sub-reasons

The 233 DXF_BLOCK_UNSUPPORTED_CONTENT warnings break down by content type:

| Entity types found in block | Warning count |
|---|---|
| ATTDEF only | 179 (76.8%) |
| ATTDEF + TEXT | 23 |
| TEXT only | 6 |
| SPLINE only | 6 |
| ATTDEF + POINT + TEXT | 6 |
| ATTDEF + SPLINE | 5 |
| POINT + TEXT | 2 |
| ELLIPSE | 2 |
| SPLINE + TEXT | 1 |
| POINT + SPLINE + TEXT | 1 |
| COMPLEX_POLYLINE | 1 |
| ATTDEF + POINT | 1 |

**202 of 233 warnings are from blocks where ATTDEF and/or TEXT is the only unsupported entity type. These blocks also contain supported geometry (LINE, LWPOLYLINE, ARC, CIRCLE) that is currently blocked by the whole-block rejection policy.**

### Top 25 skipped blocks (from inspect-dxf inventory)

| Block | Inserts | Contained entity types | Classification |
|---|---|---|---|
| FENC-1525 | 70 | ATTDEF×3, LINE×2, LWPOLYLINE×7 | 35 content, 35 transform |
| *U15 | 20 | CIRCLE×13, LINE×8 | 10 safe now, 10 transform |
| *U36 | 19 | ARC×2, ATTDEF×2, CIRCLE×1, LINE×168, LWPOLYLINE×2, TEXT×1 | 18 content, 1 transform |
| Fanuc_Henrob Controller | 18 | ARC×9, LINE×94, LWPOLYLINE×2, SPLINE×2 | 3 content, 15 transform |
| SPR-CNT_TM_RIP Concept RH RIP | 18 | ARC×94, CIRCLE×6, ELLIPSE×119, LINE×2072, SPLINE×622 | 18 transform |
| BUCKET | 14 | ARC×20, ATTDEF×1, CIRCLE×4, LINE×40, SPLINE×16 | 5 content, 9 transform |
| MANB-UP | 14 | LWPOLYLINE×6 | 1 safe now, 13 transform |
| *U48 | 12 | ATTDEF×1, LINE×84, LWPOLYLINE×8, POINT×27, TEXT×2 | 6 content, 6 transform |
| FENC-1025 | 12 | ATTDEF×3, LINE×2, LWPOLYLINE×7 | 9 content, 3 transform |
| *U267 | 11 | ATTDEF×1, LINE×4, LWPOLYLINE×6 | 11 content (ATTDEF only) |
| *U104 | 9 | ARC×6, ATTDEF×1, INSERT×2, LINE×6, LWPOLYLINE×21 | 9 nested |
| *U297 | 9 | ATTDEF×1, LINE×4, LWPOLYLINE×6 | 9 content (ATTDEF only) |
| *U35 | 8 | POLYLINE×224 | 1 safe-after-polyline, 7 transform |
| ES_SWITCH | 8 | ATTDEF×1, LWPOLYLINE×1 | 4 content, 4 transform |
| *U243 | 7 | ATTDEF×1, LINE×4, LWPOLYLINE×6 | 7 content (ATTDEF only) |
| *U257 | 7 | ATTDEF×1, LINE×4, LWPOLYLINE×6 | 7 content (ATTDEF only) |
| *U133 | 6 | ARC×6, ATTDEF×1, INSERT×2, LINE×6, LWPOLYLINE×21 | 6 nested |
| 70ZF-20013142 | 6 | LWPOLYLINE×2, TEXT×1 | 4 content, 2 transform |
| 7B-040-01N | 6 | LINE×2416, LWPOLYLINE×1 | 3 safe now, 3 transform |
| W704949_de_0424270_FE_F…CONTROLLER | 6 | ATTDEF×1, LWPOLYLINE×366 | 3 content, 3 transform |
| W716421_de_0424621… | 6 | ATTDEF×1, LWPOLYLINE×111 | 2 content, 4 transform |
| *U239 | 5 | ARC×6, ATTDEF×1, INSERT×2, LINE×6, LWPOLYLINE×21 | 5 nested |
| *U265 | 5 | ATTDEF×1, LINE×4, LWPOLYLINE×6 | 5 content (ATTDEF only) |
| 70ZF-20013171_rbt_pwr_dist_400A | 5 | ARC×24, ATTDEF×1, LINE×53, LWPOLYLINE×7, TEXT×3 | 3 content, 2 transform |
| FENC-0325 | 5 | ATTDEF×3, LINE×2, LWPOLYLINE×7 | 5 content (ATTDEF only) |

---

## 4. Text / Attribute Audit

| Location | Entity types |
|---|---|
| Direct ENTITIES section (top-level) | 0 TEXT, 0 MTEXT, 0 ATTDEF, 0 ATTRIB found |
| Inside BLOCK definitions (blocks that were expanded) | ATTDEF present in many fence/symbol blocks |
| Inside blocks that were skipped | 179+ blocks with ATTDEF as only unsupported type |

ATTDEF (attribute definition) entities define annotation fields within symbols. They are not geometry — they define where annotation text would appear in a real CAD viewer. For Kairo's purposes (geometry import), ATTDEF can be safely skipped without losing structural geometry. The associated geometry (outline, body shape) is in LINE/LWPOLYLINE entities in the same block.

TEXT/MTEXT: Present inside some blocks. Currently causes whole-block skip. Same treatment as ATTDEF: skip the annotation, expand the geometry.

---

## 5. Complex POLYLINE Audit

| Metric | Value |
|---|---|
| Total POLYLINE entities in file | 15 direct + 224+ inside block *U35 |
| Simple imported (direct) | 0 |
| Skipped (direct) | 15 |
| Skip reason (all cases) | spline-fit flag |

All 15 skipped direct POLYLINEs have the spline-fit flag set. No curve-fit, mesh, or bulge variants found in the direct ENTITIES section.

Block `*U35` (8 inserts, 7 blocked by transform complexity) contains 224 POLYLINE entities. These are all inside the block and not yet expanded. The spline-fit nature of these is unknown from the inventory alone.

---

## 6. Transform Audit

### Unsupported transform sub-reasons (217 warnings)

| Reason(s) | Count |
|---|---|
| z offset only | 109 |
| non-uniform scale + negative scale | 78 |
| non-uniform scale + negative scale + z offset | 30 |

### Notes

- **Z offset only (109)**: Many symbols are placed at Z=5 or Z=8. This is a common AutoCAD practice for grouping symbols by elevation in controls/electrical drawings. The symbols themselves are flat 2D geometry. For top-2D layout inspection, Z position is irrelevant — these could potentially be projected to Z=0.
- **Non-uniform + negative scale (108)**: Negative scale means the symbol is mirrored. Non-uniform means it is stretched. These require full matrix transforms and are out of PoC scope.
- **Top affected blocks**: FENC-1525 (35 inserts, scale 25.4 uniform but z=0 — should be transform-safe; classification may reflect individual instance variations), Fanuc_Henrob Controller (15, scale 25.4 or z=5), SPR-CNT_TM_RIP Concept RH RIP (18, z=5).

---

## 7. Nested INSERT Audit

| Metric | Value |
|---|---|
| Total nested INSERTs inside block definitions | 314 |
| INSERT instances blocked by nested INSERT | 138 |
| Unique parent block names with nested INSERTs | ~20 |

### Top parent blocks with nested INSERTs

| Block | INSERT instances using it | Nested INSERT count in block | Child block names |
|---|---|---|---|
| *U104 | 9 | 2 | (fence sub-symbols) |
| *U133 | 6 | 2 | (fence sub-symbols) |
| *U239 | 5 | 2 | (fence sub-symbols) |
| *U238 | 4 | (unknown child count) | |
| *U125 | 4 | | |
| *U112 | 4 | | |
| Plant_Layout_A0-1189×841_v2014.01 | 1 | | Title block |

Most nested INSERT parents are fence panel variants (`*U` auto-generated names) and one title block. A one-level recursive expansion would unlock up to 138 INSERT instances, but these blocks also contain ATTDEF — so partial block expansion first (Phase 10K) may unlock the non-nested geometry components of these same blocks via a different path.

---

## 8. Decision: Ranked Next-Phase Options

| Rank | Phase | Option | Unlocks | Risk | Notes |
|---|---|---|---|---|---|
| 1 | 10K | **Partial block expansion** — skip ATTDEF/TEXT/SPLINE/POINT within blocks, expand supported geometry | ~232 INSERT instances | Very low | No new geometry types, no new transform math. FENC fence panels, equipment blocks, controller symbols all become visible. |
| 2 | 10L | **Z-offset INSERT support** — treat z offset inserts as z=0 for 2D layout | ~109 INSERT instances | Low | Accept Z positional inaccuracy for 2D layout view. Symbols placed at Z=5/8 become visible. |
| 3 | 10M | **One-level nested INSERT expansion** | ~138 INSERT instances | Medium | Requires depth guard, new fixture suite. Only after 10K proves partial expansion is safe. |
| 4 | 10N | **POLYLINE spline-fit approximation** | 15+15 = 30 | Medium | Bezier-to-polyline sampling needed. Smallest visual gain. |
| 5 | — | **Non-uniform / negative scale** | ~108 INSERT instances | High | Full matrix math, mirror transforms. Out of PoC scope. |
| 6 | — | **Text/attribute geometry rendering** | (label data only) | High | Requires font system. Out of PoC scope. |

---

## 9. Recommended Next Coding Prompt

**Phase 10K — Partial block expansion:**

> Change the importer so that blocks containing unsupported entity types (ATTDEF, TEXT, SPLINE, ELLIPSE, POINT, COMPLEX_POLYLINE) no longer cause the entire INSERT to be skipped. Instead: expand all supported curve entities (LINE, LWPOLYLINE, CIRCLE, ARC, simple POLYLINE) from the block; emit a new warning code `DXF_BLOCK_PARTIAL_EXPAND` listing the skipped entity types and their counts; continue to fully skip blocks that contain nested INSERTs. Write importer tests for: (a) block with ATTDEF+LINE → LINE expanded, ATTDEF warning emitted; (b) block with TEXT+LWPOLYLINE → LWPOLYLINE expanded; (c) block with SPLINE+CIRCLE → CIRCLE expanded; (d) block with only TEXT → no geometry, dedicated warning. All 70 existing tests must pass. No viewer changes.
>
> Expected result on Scott DXF2013: supported entity count increases by several thousand (FENC fence panels + equipment blocks recovered). DXF_BLOCK_UNSUPPORTED_CONTENT warning count drops to near zero. New DXF_BLOCK_PARTIAL_EXPAND warnings appear with entity type and count details.
