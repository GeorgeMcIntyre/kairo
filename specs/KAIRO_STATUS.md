# Kairo Status

Last updated: 2026-05-09

## Git

- Branch: main
- HEAD: f40910b feat: expand z-offset dxf inserts flattened to zero for 2d layout
- In sync with origin/main

## Verification (as of HEAD)

| Check | Result |
|---|---|
| `pnpm test` | 79/79 passed |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean (viewer bundle 795 kB — chunk size warning only) |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `inspect-dxf`, `stage-viewer-scene`.
- DXF import: LINE, LWPOLYLINE, CIRCLE, ARC, LAYER, simple POLYLINE vertex chains.
- DXF pre-clean: removes scoped ACAD_REACTORS groups; appends missing EOF.
- INSERT expansion: one-level only, curve-only blocks, positive uniform scale, Z-axis rotation, z-offset flattening.
- INSERT rotation: verified by dedicated DXF file fixture and inline tests for 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance.
- INSERT partial expansion (Phase 10K): blocks with ATTDEF/TEXT/SPLINE/ELLIPSE now expand supported geometry (LINE/LWPOLYLINE/CIRCLE/ARC) instead of being fully skipped.
- INSERT z-offset flattening (Phase 10L): INSERTs with non-zero Z position are expanded with z=0 and a DXF_INSERT_Z_FLATTENED warning. Hard failures (non-uniform/negative scale) still skip.
- Viewer: top-2D and perspective modes, fit-to-scene, fit-to-selection, orbit controls, tree selection, source-map display, layer list, diagnostics panel. George confirmed viewer is usable.
- Dev scene loader: reads generated scene folders from `apps/viewer/public/scenes/`.
- Scene stats: `computeSceneStats` and `computeLayerEntityCounts` in viewer (tested).
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## What Is Broken / Missing

- 132 INSERT instances blocked by nested INSERTs (Phase 10M would address this).
- 108 INSERT instances blocked by hard transform failures (non-uniform/negative scale — out of scope).
- Text, ATTDEF, ATTRIB geometry is not rendered (by design).
- Complex POLYLINE types (all spline-fit, 15 instances) are not imported.
- Hatches, dimensions, splines are not imported.
- DXF export, GLB export, JT export: not implemented.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Known Import Warning Buckets (Scott DXF2013 — after Phase 10L)

| Warning code | Count | Notes |
|---|---|---|
| DXF_BLOCK_PARTIAL_EXPAND | 310 | Blocks with mixed supported/unsupported entity types |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 132 | Blocks containing child INSERTs |
| DXF_INSERT_Z_FLATTENED | 109 | z-offset INSERTs expanded with z=0 (new Phase 10L) |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 108 | Non-uniform/negative scale — hard skip |
| DXF_POLYLINE_UNSUPPORTED | 15 | All spline-fit |

## Scott DXF2013 Entity Progression

| Phase | Supported entities | Key change |
|---|---|---|
| Before Phase 10K | 13,711 | Only clean curve-only blocks expanded |
| After Phase 10K | 30,442 | Partial expansion: mixed blocks expand supported geometry |
| After Phase 10L | 102,562 | Z-offset INSERTs expanded: SPR-CNT_TM_RIP, Fanuc controllers, etc. |

## Latest DXF Files Tested

- `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf` — primary test file
- Viewer scene name: `scott-dxf2013-import`
- Viewer URL: `http://localhost:5173/?scene=scott-dxf2013-import`
