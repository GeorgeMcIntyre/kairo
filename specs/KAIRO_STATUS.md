# Kairo Status

Last updated: 2026-05-10

## Git

- Branch: main
- HEAD: feat: expand mirrored dxf inserts with uniform negative scale
- In sync with origin/main (post-commit)

## Verification (as of HEAD)

| Check | Result |
|---|---|
| `pnpm test` | 116/116 passed |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean (viewer bundle 771 kB — chunk size warning only) |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `inspect-dxf`, `stage-viewer-scene`.
- DXF import: LINE, LWPOLYLINE, CIRCLE, ARC, LAYER, simple POLYLINE vertex chains.
- DXF pre-clean: removes scoped ACAD_REACTORS groups; appends missing EOF.
- INSERT expansion: up to two levels deep (parent + one nested child), curve-only blocks, uniform scale (positive or negative mirror), Z-axis rotation, z-offset flattening.
- INSERT rotation: verified by dedicated DXF file fixture and inline tests for 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance.
- INSERT mirror expansion (Phase 10S): INSERTs with uniform-magnitude negative scale (e.g. xScale=-25.4, yScale=25.4) now expand with per-axis scale and arc angle reflection. DXF_INSERT_MIRROR_FLATTENED warning emitted. Works at depth-1 and depth-2 via per-axis composeInserts.
- INSERT partial expansion (Phase 10K): blocks with ATTDEF/TEXT/SPLINE/ELLIPSE now expand supported geometry (LINE/LWPOLYLINE/CIRCLE/ARC) instead of being fully skipped.
- INSERT z-offset flattening (Phase 10L): INSERTs with non-zero Z position are expanded with z=0 and a DXF_INSERT_Z_FLATTENED warning.
- One-level nested INSERT expansion (Phase 10M): parent blocks containing child INSERTs now expand grandchild geometry via composed transform. Child z-offsets flattened. Depth guard emits DXF_BLOCK_INSERT_NESTED_UNSUPPORTED for depth-3+. Cycle detection emits DXF_BLOCK_INSERT_CYCLE.
- Spline-fit POLYLINE expansion (Phase 10N-B): spline-fit (flag & 4) and curve-fit (flag & 2) POLYLINEs expanded using pre-sampled fitting vertices from the DXF file. No B-spline math required. Emits DXF_POLYLINE_SPLINE_APPROXIMATED. Works in direct entities, depth-1 block expansion, and depth-2 grandchild expansion.
- Viewer performance (Phase 10P): scene loads in ~5 s; layer toggle, fit, and selection are non-rebuilding. See Viewer Performance section below.
- Viewer: top-2D and perspective modes, fit-to-scene, fit-to-selection, orbit controls, tree selection, source-map display, layer list, diagnostics panel. George confirmed viewer is usable.
- Dev scene loader: reads generated scene folders from `apps/viewer/public/scenes/`.
- Scene stats: `computeSceneStats` and `computeLayerEntityCounts` in viewer (tested).
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## What Is Broken / Missing

- 14 INSERT instances still blocked by depth-3+ nested INSERTs (depth guard limit).
- 0 INSERT instances now blocked by hard transform failures (all 130 were uniform-magnitude mirrors — resolved by Phase 10S).
- Text, ATTDEF, ATTRIB geometry is not rendered (by design). Phase 10O-A audit: 148 TEXT + 261 ATTDEF in block definitions; 5 equipment blocks all blocked by transform complexity; 20 partial-expand blocks skip ATTDEFs.
- Hatches, dimensions, splines are not imported.
- DXF export, GLB export, JT export: not implemented.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Phase 10R-A: Transform Complexity Audit Findings (Scott DXF2013)

Run: `node packages/cli/dist/index.js inspect-dxf <scott.dxf>`

| Metric | Value |
|---|---|
| Hard-blocked top-level INSERTs | 108 |
| Category: pureNegativeUniform | 108 (100%) |
| Category: pureNonUniformPositive | 0 |
| Category: nonUniformNegative | 0 |
| Negative X axis | 108 |
| Negative Y axis | 0 |
| Negative Z axis | 0 |
| Non-uniform (raw values) | 108 |
| Negative determinant | 108 |
| Has rotation also | 66 |
| Z offset also (handled by Phase 10L) | 30 |

**Key finding:** Every top-level hard-blocked INSERT is a pure X-axis mirror. The two scale patterns are:
- `xScale=-25.4, yScale=25.4, zScale=25.4` — imperial-to-metric with X flip (35 FENC-1525, 7 MANB-UP, 3 FENC-1025, etc.)
- `xScale=-1, yScale=1, zScale=1` — simple X mirror (10 *U15, 9 SPR-CNT_TM_RIP, 7 BUCKET, etc.)

**Option unlock estimates:**
- Option A (negative uniform mirror — negate X of all expanded geometry points, use abs scale): unlocks all 108
- Option B (non-uniform XY): 0 additional
- Option C (full matrix): 108 (same as A for this file)

**Implementation path for Phase 10S:** When `xScale < 0` and `|sx|=|sy|=|sz|`, expand with `abs(scale)` and then negate the X coordinate of all output points. Rotation and z-offset combine cleanly. Risk: low (single-axis flip with uniform magnitude).

Note: 130 total `DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED` in importer vs 108 in audit — the 22-count gap is from INSERTs inside block definitions that fail during nested expansion; same X-mirror pattern expected.

## Known Import Warning Buckets (Scott DXF2013 — after Phase 10S)

| Warning code | Count | Notes |
|---|---|---|
| DXF_BLOCK_PARTIAL_EXPAND | 550 | Blocks with mixed supported/unsupported entity types (increased as more blocks now expand) |
| DXF_INSERT_Z_FLATTENED | 140 | z-offset INSERTs expanded with z=0 |
| DXF_INSERT_MIRROR_FLATTENED | 132 | Uniform-magnitude negative-scale INSERTs expanded with coordinate flip |
| DXF_POLYLINE_SPLINE_APPROXIMATED | 15 | Spline-fit POLYLINEs expanded via pre-sampled fitting vertices |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 14 | Depth-3+ inserts hit depth guard |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 0 | All resolved by Phase 10S |

## Scott DXF2013 Entity Progression

| Phase | Supported entities | Key change |
|---|---|---|
| Before Phase 10K | 13,711 | Only clean curve-only blocks expanded |
| After Phase 10K | 30,442 | Partial expansion: mixed blocks expand supported geometry |
| After Phase 10L | 102,562 | Z-offset INSERTs expanded: SPR-CNT_TM_RIP, Fanuc controllers, etc. |
| After Phase 10M | 142,378 | One-level nested INSERT expansion via composed transform |
| After Phase 10N-B | 142,393 | Spline-fit POLYLINEs expanded (+15 entities, 0 DXF_POLYLINE_UNSUPPORTED) |
| After Phase 10S | 244,953 | Mirror INSERT expansion: +102,560 entities (FENC-1525 ×35, SPR-CNT_TM_RIP ×9, etc.) |

## Viewer Performance Baseline (after Phase 10P)

Scott DXF2013: 244,953 curve entities across ~24 geometry documents (post-Phase 10S).

| Metric | Value |
|---|---|
| Scene load time | ~5 seconds (JSON fetch + parse + Float32Array assembly) |
| Draw calls | ~24 (one `THREE.LineSegments` per geometry document) |
| Layer toggle | No rebuild — toggles `object.visible` only |
| Fit scene / fit selected | No rebuild — repositions camera using cached bounds |
| Selection highlight | No rebuild — updates material color only |

### Current Render Architecture

- One `THREE.LineSegments` per geometry document/layer.
- Entity point chains are merged into a single `Float32Array` per document.
- Segments built as explicit GL_LINES pairs (each consecutive pair of entity points becomes one `[p1, p2]` entry).
- One `THREE.LineBasicMaterial` per geometry document; color is the effective layer color.
- `useEffect` is split into four independent effects: build (`[scenePackage, viewMode]`), visibility (`[hiddenLayerIds]`), fit (`[fitRequest]`), selection (`[selectedNodeId]`).
- GPU resources (geometry + materials) disposed on build effect cleanup.

### Performance Invariants — Do Not Violate

- No one Three.js object per curve entity.
- No one material per curve entity.
- No full scene rebuild on layer toggle, fit, or selection.
- If entity count grows significantly, check JSON/loading performance before committing.

### Accepted Trade-offs (Phase 10P)

- Lines render at 1 px width; `Line2` screen-space thick lines removed.
- All entities in a geometry document share the layer color; per-entity color override not rendered.
- Circle tesselation: 32 segments (was 64).
- Arc tesselation: 24 segments (was 48).

### Performance Watch Items

- 5 s load is likely JSON fetch/parse + Float32Array assembly, not Three.js upload.
- Future large entity count increases must consider JSON size and scene loading performance.
- Zod validation on load and React tree rendering may become bottlenecks if node count grows past ~10,000.

## Latest DXF Files Tested

- `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf` — primary test file
- Viewer scene name: `scott-dxf2013-import`
- Viewer URL: `http://localhost:5173/?scene=scott-dxf2013-import`
