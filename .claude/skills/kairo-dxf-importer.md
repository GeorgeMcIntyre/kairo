# Kairo DXF Importer Skill

Use this for DXF parsing, staged scene generation, geometry transforms, text extraction, and import validation.

## Current Import Coverage

- LINE, LWPOLYLINE, CIRCLE, ARC
- simple POLYLINE vertex chains
- spline-fit / curve-fit POLYLINE approximation from sampled fitting vertices
- TEXT and ATTDEF
- direct ENTITIES-section MTEXT scanner
- INSERT expansion up to parent + one nested child
- uniform scale including uniform-magnitude negative mirror
- Z-offset flattening
- partial expansion for mixed supported/unsupported blocks

## Allowed

- Add importer changes only when a specific source DXF mismatch or validation gap is proven.
- Add narrow fixtures for transform, text, or entity behavior.
- Preserve warnings for approximations and unsupported cases.
- Validate staged scene output after importer changes.
- Document policy for unsupported entities before implementing broad support.

## Not Allowed

- Do not tune semantic association or viewer behavior inside importer tasks.
- Do not silently drop geometry to improve visual output.
- Do not hide outliers or depth-guard failures without source-cause proof.
- Do not implement raw JT/GLB export from importer work.
- Do not broaden nested INSERT expansion without an audit/plan and explicit approval.
- Do not add rich MTEXT formatting unless a task explicitly authorizes it.

## Required Verification

For importer/source changes:

```powershell
pnpm typecheck
pnpm test --run
pnpm --filter @kairo/viewer build
node packages\cli\dist\index.js validate apps\viewer\public\scenes\scott-dxf2013-import
```

When regenerating staged Scott assets, record changed counts in `specs/KAIRO_STATUS.md` and update affected fixtures/snapshots intentionally.

## Known Boundaries

- 14 INSERT instances are still depth-3+ blocked.
- ATTRIB overrides are not imported; ATTDEF defaults are used.
- MTEXT inside block definitions is not expanded during INSERT expansion.
- Mirror-aware text rotation is intentionally not implemented yet.
- Hatches, dimensions, splines, 3D mesh/polyface POLYLINE variants are not production-supported.
