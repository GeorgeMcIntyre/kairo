# Kairo

Kairo is a proof-of-concept neutral internal engineering scene format and web viewer. It is designed to preserve engineering meaning across CAD-derived exchange paths: scene tree, node names, parent/child structure, transforms, geometry references, layers, metadata, source file paths, and validation reports.

It is not a CAD replacement, not a DWG clone, and not a JT exporter.

## Scope

The first useful slice supports an exploded internal scene folder:

```text
example-scene/
  manifest.json
  scene.json
  geometry/
  layers.json
  materials.json
  source-map.json
  validation-report.json
```

The project is designed to import from JT/DXF/DWG paths and export to DXF/GLB first. JT export is pencilled in as a later licensed Siemens C++ toolkit module. Direct DWG support is out of scope; use DWG to DXF first.

## Current Status

Implemented:

- pnpm workspace scaffold.
- TypeScript schema package with Zod validation.
- Core scene helpers.
- Validator with deterministic reports.
- Format hardening with golden scene assertions, invalid fixtures, stable validation codes, and unsupported-version checks.
- CLI validation with human-readable and JSON output.
- Minimal DXF import vertical slice for simple curve entities.
- Exploded sample scene under `examples/example-scene`.
- React/Vite/Three.js viewer with scene tree, viewport, properties, diagnostics, selection, and highlight.
- Vitest coverage for schema validation and validator failures.

Planned later:

- Broader DXF import/export.
- GLB export.
- Future motion/unit/O# structure.
- Future JT export module through licensed Siemens tooling.

## Commands

```bash
pnpm install
pnpm test
pnpm dev
pnpm --filter @kairo/cli build
node packages/cli/dist/index.js validate examples/example-scene
node packages/cli/dist/index.js validate examples/example-scene --json
node packages/cli/dist/index.js import-dxf packages/importer-dxf/test-fixtures/one-line.dxf imported-scene
node packages/cli/dist/index.js validate imported-scene
```

`pnpm dev` launches the viewer. It loads the included sample scene, shows validation status, and lets you select scene tree nodes to highlight their geometry and inspect metadata/source paths.

The CLI validates exploded scene folders or a direct path to `manifest.json`:

```bash
kairo validate <scene-path>
kairo validate <scene-path> --json
```

Valid scenes exit `0`. Invalid scenes and expected load failures exit `1`. JSON output is deterministic and intended for CI checks.

## Repository Layout

```text
apps/
  viewer/

packages/
  core/
  schema/
  validator/
  cli/
  importer-dxf/
  exporter-dxf/
  exporter-glb/

examples/
specs/
tests/
```

The CLI package and minimal DXF importer are implemented. DXF export and GLB export remain future package boundaries.

## Validation

The validator currently checks:

- supported format version, currently `0.1.0`
- unique node ids
- valid root node
- valid child links
- circular references
- finite 4x4 local transform matrices
- geometry references
- layer references
- source-map references
- mesh index bounds
- deterministic report ordering

Validation codes are uppercase stable contract values, including `DUPLICATE_ID`, `MISSING_ROOT`, `MISSING_CHILD`, `NODE_CYCLE`, `MISSING_GEOMETRY_REF`, `MISSING_LAYER_REF`, `MISSING_SOURCE_REF`, `INVALID_MESH_INDEX`, `INVALID_TRANSFORM`, and `UNSUPPORTED_FORMAT_VERSION`.

Unsupported import features must be reported clearly in later importer reports. Silent data loss is not acceptable.

DXF import is implemented only as a minimal first slice for `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, `LAYER`, basic colors, and unit metadata. Unsupported entities are reported with deterministic warnings. Full block/insert expansion, hatches, dimensions, text geometry, splines, DWG support, DXF export, and GLB export remain out of scope.

## Key Risks

High-risk areas are JT export, direct DWG parsing, loss of engineering metadata, scope creep, and large file performance.

Controls are a read-only POC first, schema validation, source mapping, import/export reports, golden sample files, no silent data loss, and tight vertical slices.

See [specs/FORMAT_OVERVIEW.md](specs/FORMAT_OVERVIEW.md), [specs/ROADMAP.md](specs/ROADMAP.md), and [specs/RISK_ASSESSMENT.md](specs/RISK_ASSESSMENT.md).
