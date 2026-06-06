# Kairo Package Format

Last updated: 2026-06-06

## Purpose

`.kairo` is a single-file Kairo scene package for sharing reviewed layouts without forcing every viewer session to re-import the original DXF.

The file is a standard deflated ZIP archive with a custom extension. It is not a 7z archive.

## Why ZIP

- Browser-side ZIP support is practical with a small dependency.
- 7z would require heavier JavaScript/WASM tooling.
- Corporate file handling is more predictable with a ZIP-compatible container.
- The custom `.kairo` extension gives Kairo a product-specific file type while keeping the container inspectable.

## Archive Layout

Required entries:

```text
kairo-package.json
manifest.json
scene.json
layers.json
materials.json
source-map.json
geometry/*.json
```

`kairo-package.json` records the package format version and the geometry file list:

```json
{
  "format": "kairo-package",
  "version": "0.1.0",
  "scene": {
    "manifest": "manifest.json",
    "scene": "scene.json",
    "layers": "layers.json",
    "materials": "materials.json",
    "sourceMap": "source-map.json",
    "geometry": ["geometry/geom-main-curves.json"]
  }
}
```

## Commands

Create a package from an exploded scene:

```powershell
node packages\cli\dist\index.js pack-scene .\tmp\scott-dxf2013-import .\tmp\scott-dxf2013-import.kairo
```

Validate a package:

```powershell
node packages\cli\dist\index.js validate .\tmp\scott-dxf2013-import.kairo
```

Open in the viewer:

- Use `Open DXF / Kairo`
- Select either a raw `.dxf` or a packaged `.kairo`
- Drag/drop also accepts `.dxf` and `.kairo`

## Scope

Current `.kairo` packages contain the neutral scene package only. Persisted semantic review overrides and source DXF embedding are future extensions.

## Scott P736 QA

Current package-sharing verification:

```powershell
node packages\cli\dist\index.js pack-scene apps\viewer\public\scenes\scott-dxf2013-import tmp\scott-dxf2013-import.kairo
node packages\cli\dist\index.js validate tmp\scott-dxf2013-import.kairo --json
```

2026-06-06 result:

- Package: `tmp\scott-dxf2013-import.kairo`
- Size: 9,884,877 bytes
- Scene root: `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf`
- Nodes: 29
- Geometry documents: 28
- Validation findings: 0 errors / 0 warnings / 0 infos

Use this `.kairo` package for internal sharing instead of publishing the generated staged scene payload as Pages static assets.
