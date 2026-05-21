# Kairo Package Format

Last updated: 2026-05-21

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

Create a package directly from a DXF. This is the preferred path for large production DXFs because the browser never has to load the raw file:

```powershell
node packages\cli\dist\index.js import-dxf-package "C:\path\layout.dxf" "C:\tmp\kairo-packages\layout.kairo" --report "C:\tmp\kairo-packages\layout.report.json" --quiet-warnings
```

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

## Large File Policy

- Raw DXF browser upload remains useful for smaller files and quick checks.
- Files near or above browser upload limits should be converted with `import-dxf-package`.
- The local Vite viewer automatically routes selected DXFs of 200 MB or larger through the local package endpoint before loading them.
- The local endpoint caches generated packages by selected file name, byte size, and last-modified timestamp. Selecting the same large DXF again reuses the cached `.kairo`.
- The package stores converted Kairo scene data, source metadata, and geometry JSON. It does not embed the original DXF bytes.
- Use `--redact-source-paths` when the package will be shared outside the local machine or project team.
- `import-dxf-package` compacts source-map data by default to keep very large packages loadable. Use `--full-source-map` only when per-entity source mapping is required and the file size is practical.
- The package command splits very large geometry documents before packaging so the archive is practical for later viewer loading and QA.

## Scope

Current `.kairo` packages contain the neutral scene package only. Persisted semantic review overrides and source DXF embedding are future extensions.
