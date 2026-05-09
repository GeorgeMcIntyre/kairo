# Kairo Status

Last updated: 2026-05-09

## Git

- Branch: main
- HEAD: 744d679 test: add dxf insert rotation coverage
- Ahead of origin/main by 1 commit (plus 4 spec files with local edits)
- Working tree: modified specs (KAIRO_STATUS.md, KAIRO_TASKS.md), plus untracked `.claude/`, `tmp/`

## Verification (as of HEAD)

| Check | Result |
|---|---|
| `pnpm test` | 70/70 passed |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean (viewer bundle 795 kB — chunk size warning only) |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `inspect-dxf`, `stage-viewer-scene`.
- DXF import: LINE, LWPOLYLINE, CIRCLE, ARC, LAYER, simple POLYLINE vertex chains.
- DXF pre-clean: removes scoped ACAD_REACTORS groups; appends missing EOF.
- INSERT expansion: one-level only, curve-only blocks, positive uniform scale, Z-axis rotation.
- INSERT rotation: verified by dedicated DXF file fixture and inline tests for 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance, and skip of non-uniform/negative/z-offset transforms.
- Viewer: top-2D and perspective modes, fit-to-scene, fit-to-selection, orbit controls, tree selection, source-map display, layer list, diagnostics panel. George confirmed viewer is usable.
- Dev scene loader: reads generated scene folders from `apps/viewer/public/scenes/`.
- Scene stats: `computeSceneStats` and `computeLayerEntityCounts` in viewer (tested).
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## What Is Broken / Missing

- **Large geometry gap**: 232 INSERT instances blocked by unsupported block content (mostly ATTDEF-only). These are fence panels and equipment symbols with visible geometry that should expand. Phase 10K will fix this.
- 217 INSERT instances blocked by transform complexity (z offset, non-uniform/negative scale). Z-offset-only (109) may be safe to expand for 2D layout.
- 138 INSERT instances blocked by nested INSERTs.
- Text, ATTDEF, ATTRIB geometry is not rendered (by design — Phase 10K will skip ATTDEF and expand the geometry).
- Complex POLYLINE types (all spline-fit, 15 instances) are not imported.
- Hatches, dimensions, splines are not imported.
- DXF export, GLB export, JT export: not implemented.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Known Import Warning Buckets (Scott DXF2013 — audited 2026-05-09)

| Warning code | Count | Sub-reason |
|---|---|---|
| DXF_BLOCK_UNSUPPORTED_CONTENT | 233 | 179 ATTDEF-only, 23 ATTDEF+TEXT, 6 TEXT-only, 6 SPLINE-only, rest mixed |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 217 | 109 z-offset-only, 78 non-uniform+negative scale, 30 all three |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 120 | Blocks containing child INSERTs |
| DXF_POLYLINE_UNSUPPORTED | 15 | All spline-fit |

See `specs/SCOTT_DXF_MISSING_GEOMETRY_AUDIT.md` for the full audit.

## Latest DXF Files Tested

- `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf` — primary test file
- Viewer scene name: `scott-dxf2013-import`
- Viewer URL: `http://localhost:5173/?scene=scott-dxf2013-import`
