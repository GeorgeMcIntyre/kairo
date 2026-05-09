# Kairo Status

Last updated: 2026-05-09

## Git

- Branch: main
- HEAD: 5a7c008 feat: improve dxf viewer fit and line visibility
- Ahead of origin/main by 2 commits (Phase 10G + 10H not yet pushed)
- Working tree: clean (only untracked `.claude/`)

Commits not yet on origin:
```
5a7c008 feat: improve dxf viewer fit and line visibility
eeca8f3 feat: improve viewer ergonomics for large dxf scenes
```

## Verification (as of HEAD)

| Check | Result |
|---|---|
| `pnpm test` | 68/68 passed |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean (viewer bundle 795 kB — chunk size warning only) |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `inspect-dxf`, `stage-viewer-scene`.
- DXF import: LINE, LWPOLYLINE, CIRCLE, ARC, LAYER, simple POLYLINE vertex chains.
- DXF pre-clean: removes scoped ACAD_REACTORS groups; appends missing EOF.
- INSERT expansion: one-level only, curve-only blocks, positive uniform scale, Z-axis rotation.
- Viewer: top-2D and perspective modes, fit-to-scene, fit-to-selection, orbit controls, tree selection, source-map display, layer list, diagnostics panel.
- Dev scene loader: reads generated scene folders from `apps/viewer/public/scenes/`.
- Scene stats: `computeSceneStats` and `computeLayerEntityCounts` in viewer (tested).
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## What Is Broken / Missing

- No visual QA of Scott DXF scene in viewer has been completed and signed off.
- INSERT rotation may still have edge cases — needs explicit tested fixture.
- Nested INSERTs are not expanded (reported as warnings).
- Text, ATTDEF, ATTRIB geometry is not imported (reported as warnings).
- Complex POLYLINE types (spline-fit, curve-fit, mesh, bulge) are not imported.
- Hatches, dimensions, splines are not imported.
- DXF export: not implemented.
- GLB export: not implemented.
- JT export: parked.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Known Import Warning Buckets (Scott DXF2013)

Based on pre-import analysis:
- Unsupported INSERT transforms (non-uniform scale, Z offset, nested) — largest warning bucket.
- Text / ATTDEF / ATTRIB entities — second largest.
- Complex POLYLINE types.
- HATCH, DIMENSION entities.

Exact current counts require re-running `import-dxf` after last rotation change.

## Latest DXF Files Tested

- `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf` — primary test file
- Viewer scene name: `scott-dxf2013-import`
- Viewer URL: `http://localhost:5173/?scene=scott-dxf2013-import`
