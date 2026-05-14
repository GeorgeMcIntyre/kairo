# Kairo Package Format

Last updated: 2026-05-14

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

Create a share-oriented package with source paths redacted to file names:

```powershell
node packages\cli\dist\index.js pack-scene .\tmp\scott-dxf2013-import .\tmp\scott-dxf2013-import.kairo --redact-source-paths
```

Validate a package:

```powershell
node packages\cli\dist\index.js validate .\tmp\scott-dxf2013-import.kairo
```

Run package QA and write a machine-verifiable report:

```powershell
node packages\cli\dist\index.js package-qa .\tmp\scott-dxf2013-import .\tmp\scott-dxf2013-import.kairo --redact-source-paths --report .\specs\investigations\SCOTT_KAIRO_PACKAGE_QA.md
```

Open in the viewer:

- Use `Open DXF / Kairo`
- Select either a raw `.dxf` or a packaged `.kairo`
- Drag/drop also accepts `.dxf` and `.kairo`

## Scope

Current `.kairo` packages contain the neutral scene package only. Persisted semantic review overrides and source DXF embedding are future extensions.

For sharing, prefer `--redact-source-paths`. This keeps source file names for traceability but removes local directory paths from the packaged manifest and source map.
