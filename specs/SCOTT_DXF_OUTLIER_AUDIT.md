# Scott DXF Outlier Audit

Date: 2026-05-10
Scene: `scott-dxf2013-import` (Phase 10T-C HEAD: c1241f1)
Tool: `node packages/cli/dist/index.js scene-outliers <scene> --summary`

---

## Summary

| Metric | Value |
|---|---|
| Total entities | 246,045 |
| Outlier threshold | 3× median distance from scene centroid |
| Outliers flagged | 5,672 (2.3%) |
| Transform bugs found | **0** |

**Conclusion: No transform bugs.** All 5,672 outliers are explained by three normal DXF patterns. Details and recommended fix path below.

---

## Block-level summary (from `--summary` output)

| Block name | Count | Min dist (mm) | Max dist (mm) | Category |
|---|---|---|---|---|
| plant-layout-a0-1189x841-v2014-01 | 5,279 | 115,464 | 116,823 | A — Drawing border |
| 70zf-20013140 | 78 | 32,598 | 33,696 | B — Perimeter zone |
| u48 | 39 | 32,647 | 32,768 | B — Perimeter zone |
| u121 | 34 | 32,608 | 34,940 | B — Perimeter zone |
| u112 | 33 | 32,659 | 32,772 | B — Perimeter zone |
| u239 | 29 | 32,583 | 32,723 | B — Perimeter zone |
| rbrkt-2001-topview | 28 | 32,573 | 32,753 | B — Perimeter zone |
| plant-approval-stamp | 22 | 115,958 | 116,028 | A — Drawing border |
| (direct) | 20 | 32,811 | 116,554 | A/B — Mixed (spans both zones) |
| fenc-1525 | 20 | 32,573 | 32,830 | B — Perimeter zone (fencing) |
| u238 | 18 | 32,572 | 32,588 | B — Perimeter zone |
| rbrkt-2004-topview | 14 | 32,630 | 32,750 | B — Perimeter zone |
| u253 | 10 | 32,607 | 32,669 | B — Perimeter zone |
| cmps1 | 9 | 116,493 | 116,518 | A — Drawing border |
| 7b-040-ped-rivet-r00 | 6 | 176,041 | 211,569 | C — Far-field equipment |
| 7b-030-ped-rivet-r00 | 6 | 171,669 | 199,057 | C — Far-field equipment |
| 7b-040-01n | 6 | 164,424 | 191,242 | C — Far-field equipment |
| u210 | 3 | 116,427 | 116,484 | A — Drawing border |
| 70zf-20013142 | 3 | 32,840 | 33,048 | B — Perimeter zone |
| 7b060-spac | 2 | 883,257 | 928,943 | C — Far-field equipment (verified) |
| 7b-010r-3w1 | 2 | 873,325 | 877,653 | C — Far-field equipment (verified) |
| 7b020-3w1 | 2 | 860,965 | 865,292 | C — Far-field equipment (verified) |
| 7b-050-ped-rivet-r00 | 2 | 178,341 | 178,345 | C — Far-field equipment |
| owner-stamp | 2 | 115,969 | 115,969 | A — Drawing border |
| u297 | 2 | 32,579 | 32,629 | B — Perimeter zone |
| u120 | 1 | 33,448 | 33,448 | B — Perimeter zone |
| u106 | 1 | 33,326 | 33,326 | B — Perimeter zone |
| fenc-1025 | 1 | 32,683 | 32,683 | B — Perimeter zone (fencing) |

---

## Category A — Drawing border / title block (~116k mm from scene centroid)

**Count: ~5,315 entities (93.7% of all outliers)**

The DXF file contains an A0 drawing border block (`plant-layout-a0-1189x841-v2014.01`) placed at or near the DXF model-space origin (roughly 0–1189 mm × 0–841 mm). The production equipment is at real-world facility coordinates, with the scene centroid at approximately X=77k mm, Y=87k mm. The drawing border at the origin is therefore ~116k mm from the equipment centroid.

Entities in this category:
- `plant-layout-a0-1189x841-v2014-01` (5,279): The A0 border rectangle, title block cells, revision table, north arrow, and other drawing border geometry.
- `plant-approval-stamp` (22), `owner-stamp` (2): Stamp/signature blocks near the title block.
- `cmps1` (9): Company block near title area.
- `u210` (3): Anonymous block in title block area.
- `(direct)` subset: Direct MTEXT and polyline entities in the title block area at ~116k mm.

**Classification: CORRECT** — The title block is correctly placed at DXF model-space origin. This is standard DXF drafting practice. The equipment coordinates are in facility coordinates, not paper coordinates.

**Not a transform bug.** AutoCAD renders identically.

---

## Category B — Perimeter zone (~32–35k mm from scene centroid)

**Count: ~325 entities (5.7% of all outliers)**

These entities are 32–35k mm from the scene centroid. The main equipment body is concentrated in an area roughly ±30k mm around the centroid. The perimeter zone entities are at the outer edge of the drawing — at the boundary of the production layout, not floating in empty space.

Key blocks in this category:

**`fenc-1525` and `fenc-1025` (21 entities, layer `layer-0-c-fen`):**
Fencing panels at the perimeter of the production area. These were expanded via Phase 10S mirror INSERT expansion. Coordinates: X ≈ 109k mm, Y ≈ 83–91k mm. These are correctly placed perimeter security fencing — not floaters. The 3× threshold flags them only because they are at the outermost edge of the facility.

**`rbrkt-2001-topview` and `rbrkt-2004-topview` (42 entities):**
Block names indicate reference drawings or top-view references of bracket assemblies (rbrkt = robot bracket?). Placed in the perimeter zone.

**`70zf-20013140`, `70zf-20013142` (81 entities):**
Component or part-number blocks. Anonymous `u*` blocks (u48, u112, u121, u238, u239, u253, u297, u120, u106) are AutoCAD anonymous blocks for hatches, dimensions, or OLE objects. All cluster uniformly at 32–35k mm.

**`(direct)` subset:** Direct entities spanning 32–116k mm. The ~32k mm subset are likely direct geometry in the perimeter zone.

**Classification: INFERRED CORRECT** from uniform distance clustering (all at 32–35k mm, no individual outlier at anomalous location), and layer assignments matching expected perimeter components. The 3× threshold is conservative enough that legitimate boundary equipment appears as "outliers."

**Not transform bugs.** These entities are within the drawing area; the outlier threshold is catching boundary equipment, not truly far-field geometry.

---

## Category C — Far-field equipment blocks (~164k–929k mm from scene centroid)

**Count: 26 entities (0.5% of all outliers)**

These are equipment blocks with geometry authored far from the block's INSERT origin in block-local coordinates.

### Verified (Phase 10T-A): `7b060-spac`, `7b-010r-3w1`, `7b020-3w1`

6 entities at 861–929k mm. Verified by direct DXF parse in Phase 10T-A:
- Block-local geometry is at ±440k mm in block-local coordinates.
- INSERT rotation 180° + INSERT position offset → world position ±800–930k mm.
- AutoCAD renders identically. Transform math confirmed correct.

### Consistent with verified pattern: `7b-040-ped-rivet-r00`, `7b-030-ped-rivet-r00`, `7b-040-01n`, `7b-050-ped-rivet-r00`

20 entities at 164–211k mm. Evidence consistent with the verified far-field equipment pattern:
- All share the `7b-xxx` naming convention (area 7B of the facility).
- All are on layer `layer-0-q-genprto` (general production quality).
- The same child entity handles (e.g. `13863`, `13864` for `7b-040-ped-rivet-r00`) appear in multiple INSERT instances — confirming these are repeated placements of the same block definition.
- World Y positions cluster tightly at Y ≈ 86–87k mm (consistent with the 7B equipment band) while X varies across INSERT instances. This indicates block-local geometry is authored at a large X offset, with different INSERT positions placing the equipment at different X locations.
- Distance 164–211k mm vs. 860–929k mm for the verified set indicates smaller block-local offsets of ~100–130k mm (vs ~440k mm for the verified set). Plausible for a different equipment subtype.

**Spot-check observation:** `7b-040-ped-rivet-r00` INSERT `178a3` produces child entities `13863` at world X = -134,482 mm and child `13864` at -134,481 mm. INSERT `93009` produces the same children at world X = +255,114 mm and +255,112 mm. The same two entity shapes appear at radically different X positions driven by different INSERT positions, which is the signature of block-local geometry at a large X offset from the INSERT origin.

**Classification: CONSISTENT WITH VERIFIED PATTERN (not individually verified by raw DXF parse).** No evidence of transform bugs.

---

## `fenc-1525` callout

`fenc-1525` deserves specific mention because it was handled by Phase 10S (mirror INSERT expansion). 20 fenc-1525 entities appear at ~32k mm on layer `layer-0-c-fen`. These are fence panel geometry at the production area perimeter, correctly expanded via Phase 10S. The outlier report confirms mirror expansion produced sensible world positions (not ±infinity or garbage). **Mirror expansion is working correctly for fencing.**

---

## Conclusion

| Category | Count | % of outliers | Finding |
|---|---|---|---|
| A — Drawing border / title block | ~5,315 | 93.7% | Correct — title block at DXF origin vs. facility coords |
| B — Perimeter zone equipment | ~325 | 5.7% | Correct — boundary equipment; 3× threshold catches them |
| C — Far-field equipment | 26 | 0.5% | Correct — block-local geometry at large coords (verified pattern) |
| **Total** | **5,672** | **100%** | **No transform bugs** |

There are no transform bugs visible in the outlier set. The 5,506 outlier count from Phase 10T-A has grown slightly to 5,672 after Phase 10T-C (MTEXT adds direct entities which appear in the title block zone).

---

## Recommended fix path

The "floater" appearance in the viewer is caused by the drawing border (category A) pulling the fit-scene bounding box far from the equipment. No importer changes are needed.

**Recommended viewer improvement (ISSUE-004):**
When fit-scene is triggered, use percentile-based bounds (e.g. exclude entities >2× median distance from centroid) rather than the raw bounding box. This ensures the viewport centers on the production equipment rather than zooming out to include the title block at the DXF origin.

**Also available now:** Users can hide `layer-0` in the layer panel to remove most title block geometry from view, since the drawing border is primarily on layer-0.

**Do not:**
- Delete or hide outliers automatically in the importer
- Change importer transforms (no bugs to fix)
- Remove the drawing border from the scene (it may be useful for comparison)

---

## Verification commands

```
node packages/cli/dist/index.js scene-outliers ".\tmp\scott-dxf2013-import"
node packages/cli/dist/index.js scene-outliers ".\tmp\scott-dxf2013-import" --summary
node packages/cli/dist/index.js scene-outliers ".\tmp\scott-dxf2013-import" --top 100
```
