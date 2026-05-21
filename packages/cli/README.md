# @kairo/cli

Node.js command-line tools for Kairo scene packages.

## Commands

```bash
kairo validate <scene-path>
kairo validate <scene-path> --json
kairo import-dxf <input.dxf> <output-dir> [--quiet-warnings]
kairo import-dxf-package <input.dxf> <output.kairo> [--report <report.json>] [--quiet-warnings] [--redact-source-paths] [--full-source-map]
kairo pack-scene <scene-path> <output.kairo>
```

`scene-path` may be an exploded scene folder, its `manifest.json` file, or a `.kairo` package.

Implemented:

- `validate`
- `import-dxf`
- `import-dxf-package`
- `pack-scene`

Planned later:

- `create-sample`
- `export-dxf`
- `export-glb`

## Large DXF Workflow

Use `import-dxf-package` for production DXFs that are too large for browser upload. It imports the DXF once, writes a ZIP-backed `.kairo` package, validates the package by reading it back, and can emit a JSON QA report with entity coverage and package metadata. The package uses a compact source map by default so very large files can stay loadable; pass `--full-source-map` only for smaller review packages that need per-entity source mapping.

```powershell
node packages\cli\dist\index.js import-dxf-package "C:\path\layout.dxf" "C:\tmp\kairo-packages\layout.kairo" --report "C:\tmp\kairo-packages\layout.report.json" --quiet-warnings
```

For very large DXFs, run through `tools\Convert-DxfSetToKairoPackages.ps1` so Node gets a larger heap than the default browser/Node limit.
