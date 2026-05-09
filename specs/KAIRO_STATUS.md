# Kairo Status

Last updated: 2026-05-09

## Git

- Branch: main
- HEAD: 6111938 feat: expand one-level nested dxf block inserts
- In sync with origin/main

## Verification (as of HEAD)

| Check | Result |
|---|---|
| `pnpm test` | 89/89 passed |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean (viewer bundle 795 kB — chunk size warning only) |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `inspect-dxf`, `stage-viewer-scene`.
- DXF import: LINE, LWPOLYLINE, CIRCLE, ARC, LAYER, simple POLYLINE vertex chains.
- DXF pre-clean: removes scoped ACAD_REACTORS groups; appends missing EOF.
- INSERT expansion: up to two levels deep (parent + one nested child), curve-only blocks, positive uniform scale, Z-axis rotation, z-offset flattening.
- INSERT rotation: verified by dedicated DXF file fixture and inline tests for 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance.
- INSERT partial expansion (Phase 10K): blocks with ATTDEF/TEXT/SPLINE/ELLIPSE now expand supported geometry (LINE/LWPOLYLINE/CIRCLE/ARC) instead of being fully skipped.
- INSERT z-offset flattening (Phase 10L): INSERTs with non-zero Z position are expanded with z=0 and a DXF_INSERT_Z_FLATTENED warning. Hard failures (non-uniform/negative scale) still skip.
- One-level nested INSERT expansion (Phase 10M): parent blocks containing child INSERTs now expand grandchild geometry via composed transform. Child z-offsets flattened. Depth guard emits DXF_BLOCK_INSERT_NESTED_UNSUPPORTED for depth-3+. Cycle detection emits DXF_BLOCK_INSERT_CYCLE.
- Viewer: top-2D and perspective modes, fit-to-scene, fit-to-selection, orbit controls, tree selection, source-map display, layer list, diagnostics panel. George confirmed viewer is usable.
- Dev scene loader: reads generated scene folders from `apps/viewer/public/scenes/`.
- Scene stats: `computeSceneStats` and `computeLayerEntityCounts` in viewer (tested).
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## What Is Broken / Missing

- 14 INSERT instances still blocked by depth-3+ nested INSERTs (depth guard limit).
- 130 INSERT instances blocked by hard transform failures (non-uniform/negative scale — out of scope).
- Text, ATTDEF, ATTRIB geometry is not rendered (by design).
- Complex POLYLINE types (all spline-fit, 15 instances) are not imported.
- Hatches, dimensions, splines are not imported.
- DXF export, GLB export, JT export: not implemented.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Known Import Warning Buckets (Scott DXF2013 — after Phase 10M)

| Warning code | Count | Notes |
|---|---|---|
| DXF_BLOCK_PARTIAL_EXPAND | 453 | Blocks with mixed supported/unsupported entity types |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 130 | Non-uniform/negative scale — hard skip |
| DXF_INSERT_Z_FLATTENED | 110 | z-offset INSERTs expanded with z=0 |
| DXF_POLYLINE_UNSUPPORTED | 15 | All spline-fit |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 14 | Depth-3+ inserts hit depth guard |

## Scott DXF2013 Entity Progression

| Phase | Supported entities | Key change |
|---|---|---|
| Before Phase 10K | 13,711 | Only clean curve-only blocks expanded |
| After Phase 10K | 30,442 | Partial expansion: mixed blocks expand supported geometry |
| After Phase 10L | 102,562 | Z-offset INSERTs expanded: SPR-CNT_TM_RIP, Fanuc controllers, etc. |
| After Phase 10M | 142,378 | One-level nested INSERT expansion via composed transform |

## Latest DXF Files Tested

- `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf` — primary test file
- Viewer scene name: `scott-dxf2013-import`
- Viewer URL: `http://localhost:5173/?scene=scott-dxf2013-import`
