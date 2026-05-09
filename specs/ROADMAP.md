# Roadmap

## Phase 1: Repo Scaffold

- pnpm workspace.
- TypeScript, Vite, React, Three.js, Zod, and Vitest.
- Package boundaries for core, schema, validator, CLI, DXF import/export, and GLB export.

Status: implemented for the proof-of-concept foundation.

## Phase 2: Schema And Core Model

- Manifest, scene, node, geometry, layer, material, source map, and validation report schemas.
- Shared TypeScript types.
- Basic core helpers for scene lookup and sample loading.

Status: implemented for the first vertical slice.

## Phase 3: Validator

- Unique node ids.
- Root node existence.
- Child link validity.
- Circular reference detection.
- Transform matrix shape.
- Geometry, layer, and source-map references.
- Deterministic report output.

Status: implemented for the first vertical slice.

## Phase 4: Sample Scene

- Small exploded package under `examples/example-scene`.
- Mesh part and DXF-like drawing reference geometry.
- Layers, material, source-map, and checked validation report.

Status: implemented.

## Phase 5: Viewer

- Left scene tree.
- Center Three.js viewport.
- Right properties panel.
- Bottom diagnostics panel.
- Included sample scene loading.
- Tree selection and viewport picking where practical.
- Selection highlight and source path display.

Status: implemented for sample mesh and curve-set geometry.

## Phase 6: Format Hardening

- Golden tests for `examples/example-scene`.
- Invalid scene fixtures for validator boundaries.
- Stable uppercase validation codes.
- Unsupported format version validation.
- Deterministic validation report tests.

Status: implemented.

## Phase 7: CLI Validate Tool

Implemented command:

- `validate`

Supported validation inputs:

- exploded scene folder
- direct path to `manifest.json`

Supported output:

- deterministic human-readable output
- deterministic JSON with `--json`

Status: implemented.

Planned commands:

- `create-sample`
- `import-dxf`
- `export-dxf`
- `export-glb`

## Phase 8: DXF Import Investigation

- Document first-slice DXF scope.
- Compare practical TypeScript/Node parser options.
- Define DXF to Kairo mapping.
- Propose future importer API and report shape.
- Define future importer tests and risks.

Status: implemented as investigation only. No DXF importer behavior exists yet.

## Phase 9: Minimal DXF Importer Vertical Slice

- `packages/importer-dxf` implements `importDxfToKairo(inputPath, options)`.
- `writeScenePackage(outputDir, scenePackage)` writes deterministic exploded scene folders.
- CLI command `kairo import-dxf <input.dxf> <output-dir>` imports, writes, and validates output.
- Supported entities: `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, and `LAYER`.
- Unsupported parsed entities produce deterministic warnings.
- `INSERT` is detected and reported; block expansion is not implemented.

Status: implemented as a minimal importer slice.

## Phase 10: DXF Import Expansion And Export

Initial import scope:

- `LINE`
- `CIRCLE`
- `ARC`
- `LWPOLYLINE` or simple `POLYLINE`
- `LAYER`
- simple colour
- simple `POLYLINE`
- block/insert expansion only after dedicated fixtures

Unsupported entities must be recorded in an import report with counts, warnings, layers found, and skipped entity details.

Status: import expansion partially implemented.

- Audited DXF pre-clean handles scoped `ACAD_REACTORS` groups and missing EOF compatibility.
- `inspect-dxf` produces reusable block/insert inventory reports.
- Simple legacy `POLYLINE` vertex chains are imported; complex legacy polylines remain explicit warnings.
- Strict one-level simple `INSERT` expansion is implemented for supported curve-only blocks with positive uniform scale and Z-axis rotation, without nested inserts or remaining complex transforms.
- DXF export remains not implemented.

Initial export scope:

- lines
- polylines
- circles/arcs if already represented
- layers where possible

## Phase 11: GLB Export

Export visible mesh geometry from the internal format to GLB. If this grows beyond the proof-of-concept slice, provide a clear interface and tests before filling in full exporter behavior.

## Phase 12: Tests And Docs

Keep golden sample files, deterministic reports, and validator tests close to the format contract. Add DXF and GLB tests when those phases start.
