# Kairo Format Overview

Kairo is a neutral internal engineering scene format for preserving CAD-derived meaning between import and export paths. It is a middle layer, not a CAD kernel, a DWG clone, or a JT exporter.

The first proof of concept uses an exploded folder package:

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

## Manifest

`manifest.json` identifies the package format, version, units, axis system, root scene file, creating tool, and source format information.

Required concepts:

- Format name and version.
- Units and axis system.
- Root scene file.
- Created-by metadata.
- Source format, path, and notes.

The current supported format version is `0.1.0`. Packages with any other `manifest.version` fail validation with `UNSUPPORTED_FORMAT_VERSION`.

## Scene

`scene.json` stores the engineering scene tree:

- Unique node ids.
- Display names.
- Node type.
- Parent-child structure through child id links.
- Local transform matrix and optional world transform matrix.
- Geometry references.
- Layer id.
- Metadata.
- Source reference.

The root node is named by `rootNodeId`. The validator treats missing roots, missing child links, duplicate ids, invalid transforms, and circular references as errors.

## Geometry

Geometry is split into documents under `geometry/`.

Mesh geometry is supported first:

- `vertices`
- `indices`
- optional `normals`
- optional colours/material
- optional bounding box
- optional layer/source references

Drawing and curve geometry is represented as `curve-set` documents with entities:

- `line`
- `polyline`
- `arc`
- `circle`

Blocks and inserts are planned for a later DXF phase and must be reported as unsupported until implemented.

## Layers, Materials, And Sources

`layers.json` stores stable layer ids, display names, colours, visibility, and layer metadata.

`materials.json` stores basic display materials for mesh rendering and GLB export.

`source-map.json` maps scene nodes and geometry back to original files and source entities. This is the control against silent metadata loss.

## Validation Report

`validation-report.json` captures deterministic validation output:

- pass/fail status
- error, warning, and info counts
- ordered findings with code, severity, message, and path

Validation codes are stable contract values. Current codes:

- `SCHEMA_INVALID`
- `DUPLICATE_ID`
- `MISSING_ROOT`
- `MISSING_CHILD`
- `NODE_CYCLE`
- `ORPHAN_NODE`
- `MISSING_GEOMETRY_REF`
- `MISSING_LAYER_REF`
- `MISSING_SOURCE_REF`
- `INVALID_MESH_VERTEX_ARRAY`
- `INVALID_MESH_INDEX`
- `INVALID_TRANSFORM`
- `UNSUPPORTED_FORMAT_VERSION`

Unsupported import features must be warnings or errors in import reports. They must not be silently dropped.

## CLI Validation

The Phase 7 CLI validates exploded scene folders without opening the viewer:

```bash
kairo validate examples/example-scene
kairo validate examples/example-scene --json
```

Human-readable output is intended for local use. JSON output contains `valid`, `summary`, and `issues` fields and is intended for CI. Validation failures use the same stable codes listed above.
