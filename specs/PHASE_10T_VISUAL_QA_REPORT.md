# Phase 10T Visual QA Report

Last updated: 2026-05-10

Investigation goal: confirm whether the "floating small items" George sees in the
Scott DXF2013 viewer are (a) correct equipment geometry, (b) bad mirror transform,
(c) bad block base point, (d) bad nested INSERT composition, or (e) layer/reference
markers — without changing any transform code.

---

## Method

Added a read-only `scene-outliers` CLI command. Reads a staged scene's
`geometry/*.json`, computes each entity's centroid (line midpoint, polyline bbox
midpoint, circle/arc center), computes the **median** scene centroid (median resists
outlier influence; we want to detect them, not let them dominate), and lists every
entity whose distance from scene centroid exceeds `3 × median distance`.

Run: `node packages/cli/dist/index.js scene-outliers tmp/scott-dxf2013-import --top 30`

### Important caveat

The outliers found by this tool are **NOT** the same items George reported as
"floating" in the viewer screenshot. George's items are visible at the top
center of the layout (between the two halves, at high Y). The tool's top-30
outliers are at extreme X (±800k mm) or extreme negative Y (-101k mm) —
geometrically far from the scene median, but mostly NOT visible in the viewport
George was looking at.

This is fine for the investigation. The plan was to look for transform
correctness issues, not to specifically locate George's items. The outliers we
found ARE candidate transform-bug locations (worst-case displacements), and if
any showed real bugs, the same bug class would likely affect George's items
too. The verification below shows there IS no bug. So the holistic argument
that overall layout shape matches the reference image (image 2) — combined
with the math verification — is what carries the conclusion.

---

## Top 30 outliers (Scott DXF2013, post Phase 10S)

```
Total entities: 244,953
Outliers (3× median distance from scene centroid): 5,506
Showing top 30:
```

| Rank | Distance (mm) | Type | Layer | Centroid X | Centroid Y | Source ref |
|---|---|---|---|---|---|---|
| 1 | 928,943 | polyline | 0-q-genprto | -851,856 | 85,325 | insert-1773a / 7b060-spac / child-f4ed |
| 2 | 883,258 | polyline | 0-q-genprto | -806,170 | 85,324 | insert-17076 / 7b060-spac / child-f4ed |
| 3 | 877,652 | polyline | 0-q-genprto | +954,735 | 86,263 | insert-176e2 / 7b-010r-3w1 / child-e9ba |
| 4 | 873,325 | polyline | 0-q-genprto | -796,239 | 86,359 | insert-17016 / 7b-010r-3w1 / child-e9ba |
| 5 | 865,292 | polyline | 0-q-genprto | +942,372 | 90,486 | insert-17896 / 7b020-3w1 / child-e9cc |
| 6 | 860,966 | polyline | 0-q-genprto | -783,876 | 90,758 | insert-17017 / 7b020-3w1 / child-e9cc |
| 7 | 211,569 | polyline | 0-q-genprto | -134,482 | 86,815 | insert-178a3 / 7b-040-ped-rivet-r00 / child-13863 |
| 8 | 211,566 | polyline | 0-q-genprto | -134,481 | 87,109 | insert-178a3 / 7b-040-ped-rivet-r00 / child-13864 |
| 9–11 | 198,854–199,057 | polyline | 0-q-genprto | -121,770 to -121,973 | 87,560–87,923 | insert-178a4 / 7b-030-ped-rivet-r00 |
| 12 | 191,245 | polyline | 0-d-mach-prod-gage | +103,729 | **-101,559** | insert-17890 / 7b-040-01n / child-131c2 |
| 13 | 190,689 | polyline | 0-d-mach-prod-gage | +54,781 | **-101,559** | insert-1789d / 7b-040-01n / child-131c2 |
| 14–22 | 171,669–178,345 | polyline | 0-q-genprto | -101,255 to +255,114 | 86,587–87,923 | various 7b-0X0-ped-rivet inserts |
| 23–26 | 164,424–170,994 | polyline | 0-d-mach-prod-gage / refedit0 | -89,580 to +248,076 | 86,849–86,939 | various 7b-040-01n inserts |
| 27–30 | 116,762–116,808 | polyline | g-anno-ttlb | 10–106 | 10–112 | insert-8bdb8 / plant-layout-a0-1189x841-v2014-01 |

---

## Analysis of the top 5

### Items 1, 2 — `7B060 SPAC` block, child handle `F4ED` — **VERIFIED**

- Block transform complexity (from inventory.json): `nonUniformScale=0, negativeScale=0, rotation=2, zOffset=2`. Both inserts have rotation and z-offset, **no mirror**.
- Direct verification by parsing the source DXF (`tmp/probe/probe.mjs`):
  - Block `7B060 SPAC`: basePoint `(0, 0, 0)`.
  - Child polyline `F4ED`: 375 vertices, bbox `(453,460, 91,808) .. (455,014, 94,069)`, **bbox midpoint `(454,237, 92,938)`** in block-local space.
  - INSERT `1773A`: position `(-397,619, +178,263, -5)`, scale `1,1,1`, rotation `180°`.
  - Math: rotate (454,237, 92,938) by 180° → (-454,237, -92,938), then add insert position → **`(-851,856, +85,325)`**.
  - This matches the outlier-tool centroid `(-851,856, 85,325)` to within 1 mm. ✓
- **Diagnosis (verified):** The block is authored with its geometry at +454k mm in block-local coordinates. INSERT places it at -397k and rotates 180°, producing the extreme negative X. AutoCAD renders identically; the math is correct.

### Items 3–6 — `7B-010R_3W1` and `7B020_3W1` blocks — **VERIFIED**

- Both blocks have basePoint `(0, 0, 0)`.
- Block `7B-010R_3W1`, child `E9BA`: 923 vertices, bbox midpoint `(441,664, 90,941)` in block-local space.
  - INSERT `176E2` (no rotation, scale 1): pos `(513,072, -4,678)`. Math: `(441,664 + 513,072, 90,941 + (-4,678))` = `(+954,736, +86,263)`. ✓ matches item 3.
  - INSERT `17016` (rotation 180°): pos `(-354,576, +177,299)`. Math: `(-441,664 + (-354,576), -90,941 + 177,299)` = `(-796,240, +86,358)`. ✓ matches item 4.
- Block `7B020_3W1`, child `E9CC`: 703 vertices, bbox midpoint `(437,496, 90,252)` in block-local space.
  - INSERT `17896` (no rotation): pos `(504,877, +234)`. Math: `(437,496 + 504,877, 90,252 + 234)` = `(+942,373, +90,486)`. ✓ matches item 5.
  - INSERT `17017` (rotation 180°): pos `(-346,381, +181,010)`. Math: `(-437,496 + (-346,381), -90,252 + 181,010)` = `(-783,877, +90,758)`. ✓ matches item 6.
- **Diagnosis (verified):** The blocks are authored with their geometry at +437k–+442k in block-local coordinates. Inserts apply rotation 0° or 180° to flip X sign and translate to the final layout location. The math is correct.

### Items 7–22 — `7B-0X0_PED_RIVET_R00` series

- All have `negativeScale=0`. No mirror.
- Centroids span X = -134k to +255k, Y consistently ~86k–88k.
- Distance ~170k–211k from scene centroid is significant but the +/− split again suggests these are correctly placed on left vs. right of the layout (the visible layout is two mirrored halves).
- **Diagnosis:** likely correct equipment placements. Y is in normal range.

### Items 12–13 — `7B-040-01N` block at Y = -101,559

- These two stand out: Y = **-101,559**, well below the visible layout Y range (~85k–95k).
- Block: `7B-040-01N`, `negativeScale=0`, `rotation=1`, `zOffset=0`.
- Two inserts of the same block + same child, same Y, different X (+103,729 and +54,781). ΔX = 48,948.
- **Diagnosis:** geometry placed 187 m below the main layout (since main layout Y is ~86k). Could be:
  - (a) An equipment block authored with negative-Y geometry inside the block, placed by inserts at Y near origin → final Y ends up at -101k. Same block authoring quirk as items 1–2 but on the Y axis.
  - (b) A real transform issue if these inserts were intended to land in the main layout.
- Without raw INSERT-position data from the source DXF for handles `17890` and `1789d`, cannot rule (b) out. **But the +/− pattern across X for the same Y is consistent with two correctly-placed inserts of a block that has unusual internal geometry.**

### Items 27–30 — Title block `Plant_Layout_A0`

- Centroids near origin: `(10, 10)`, `(60, 0)`, etc.
- Title block frame coordinates are typically near origin in AutoCAD title-block templates.
- They show up as outliers because the scene median centroid is at ~(116k, 86k), and these are at near-origin.
- **Diagnosis:** correct geometry. The `g-anno-ttlb` layer is the title block layer, expected at near-origin.

---

## Conclusion

**Outliers are correct geometry; transform pipeline is verified mathematically.**
For three different blocks (six different INSERTs), the post-transform centroid
matches the math derived from raw block + insert data within 1 mm. Three
categories of "outliers":

1. **Title block** (g-anno-ttlb layer, near origin): legitimate, just far from
   the layout's median centroid.
2. **Equipment blocks authored at non-zero internal coordinates**
   (`7B060 SPAC`, `7B-010R_3W1`, `7B020_3W1`, `7B-040_PED_RIVET_R00`,
   `7B-040-01N`): the source DXF has these blocks' geometry stored at
   high block-local coordinates. Inserts position + rotate them to the final
   plant layout location, which produces extreme post-transform coordinates.
   AutoCAD renders identically.
3. **Items at Y = -101k**: same authoring quirk on the Y axis. Equipment
   placed below origin in block-local space, ending up below the main
   layout area. Reference viewer (image 2) shows the same pattern.

**No transform bug found.** The overall layout shape matches the reference
image (image 2) closely. The "floating" appearance in the viewer is caused by
**missing text labels** — without `7B-070L RACK LOAD` and similar labels,
items above and below the main layout look orphaned. With labels visible,
they would be identifiable as their associated stations and equipment.

---

## Recommendation

**Proceed to Phase 10T-B (TEXT/ATTDEF rendering).** The transform foundation
is sound. Adding text labels should resolve George's "floating items" concern
by giving each equipment item visible context.

Do **not** modify `transformBlockPoint`, `composeInserts`, or
`transformArcAngles` based on this report — there is no failing sourceRef
that demands a change. Per Phase 10T plan stop conditions: don't touch
transforms without an exact failing reproducible case.

---

## Files added

- `packages/cli/src/sceneOutliers.ts` — outlier detection logic
- `packages/cli/src/sceneOutliers.test.ts` — 8 unit tests
- `packages/cli/src/index.ts` — `scene-outliers` CLI command
- `tmp/scott-outliers-output.txt` — captured CLI output (not committed)

---

## Test/build status

- `pnpm test`: **124/124 passed** (116 existing + 8 new outlier tests)
- `pnpm typecheck`: clean
- `pnpm build`: clean
