# Kairo Large DXF Pipeline

Last updated: 2026-05-21

## Purpose

Large production DXFs should be converted once into `.kairo` packages before viewer review. This avoids browser file-size limits and gives every later step a validated, repeatable source artifact.

## One-File Workflow

```powershell
pnpm build
node packages\cli\dist\index.js import-dxf-package "C:\path\layout.dxf" "C:\tmp\kairo-packages\layout.kairo" --report "C:\tmp\kairo-packages\layout.report.json" --quiet-warnings
node packages\cli\dist\index.js validate "C:\tmp\kairo-packages\layout.kairo"
```

Open the `.kairo` file in the viewer with `Open DXF / Kairo`, then use `Export GLB / JT` with the Process Simulate preset when the goal is equipment placement in Siemens Process Simulate.

In the local Vite viewer, selecting a raw `.dxf` larger than 200 MB automatically uses the same package path. The browser streams the selected DXF to the local endpoint, the endpoint runs `import-dxf-package` in a separate high-heap Node process, and the viewer opens the generated `.kairo` package. Generated packages are cached by file name, byte size, and last-modified timestamp, so selecting the same large DXF again reuses the cached package. Smaller DXFs still use the browser worker for fast interactive checks.

## Current Production DXFs

After `pnpm build`, use the batch wrapper when all five files are available locally:

```powershell
.\tools\Convert-DxfSetToKairoPackages.ps1 `
  -OutputDirectory "C:\tmp\kairo-packages" `
  -NodeMaxOldSpaceMb 12288 `
  -InputDxf `
    "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\ScotTesting\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf", `
    "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\KCTP-B-01-7G-0001-24MY-P736-PRO-IMPBASE_20260507_DXF2013.dxf", `
    "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\DTP-B-01-3X-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf", `
    "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\KCT-B-01-8X-0001-24MY-P736-PRO-IMPBASE_20260518_DXF2013.dxf", `
    "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\KCTP-B-01-7C-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf"
```

The wrapper writes one `.kairo`, one `.report.json`, and a `kairo-package-summary.csv`.
For very large files such as the 366 MB DTP layout, keep the CLI path and use `.kairo` in the viewer instead of opening the raw DXF in the browser. The package command uses a compact source map by default; the conversion coverage remains in the report JSON.

Individual commands are equivalent:

```powershell
node packages\cli\dist\index.js import-dxf-package "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\ScotTesting\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf" "C:\tmp\kairo-packages\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.kairo" --report "C:\tmp\kairo-packages\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.report.json" --quiet-warnings
node packages\cli\dist\index.js import-dxf-package "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\KCTP-B-01-7G-0001-24MY-P736-PRO-IMPBASE_20260507_DXF2013.dxf" "C:\tmp\kairo-packages\KCTP-B-01-7G-0001-24MY-P736-PRO-IMPBASE_20260507_DXF2013.kairo" --report "C:\tmp\kairo-packages\KCTP-B-01-7G-0001-24MY-P736-PRO-IMPBASE_20260507_DXF2013.report.json" --quiet-warnings
node packages\cli\dist\index.js import-dxf-package "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\DTP-B-01-3X-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf" "C:\tmp\kairo-packages\DTP-B-01-3X-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.kairo" --report "C:\tmp\kairo-packages\DTP-B-01-3X-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.report.json" --quiet-warnings
node packages\cli\dist\index.js import-dxf-package "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\KCT-B-01-8X-0001-24MY-P736-PRO-IMPBASE_20260518_DXF2013.dxf" "C:\tmp\kairo-packages\KCT-B-01-8X-0001-24MY-P736-PRO-IMPBASE_20260518_DXF2013.kairo" --report "C:\tmp\kairo-packages\KCT-B-01-8X-0001-24MY-P736-PRO-IMPBASE_20260518_DXF2013.report.json" --quiet-warnings
node packages\cli\dist\index.js import-dxf-package "C:\Users\georgem\source\repos\kairo_data\DXF_Layouts\OneDrive_1_5-20-2026\KCTP-B-01-7C-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf" "C:\tmp\kairo-packages\KCTP-B-01-7C-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.kairo" --report "C:\tmp\kairo-packages\KCTP-B-01-7C-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.report.json" --quiet-warnings
```

## QA Expectations

- `validate` returns zero errors for every `.kairo` package.
- The package report records conversion percentage, supported/unsupported entities, warnings, units, bounds, package bytes, and read-back validation.
- A conversion below 100% is not a viewer failure by itself, but every failed source entity must appear in the report.
- CAD Exchanger Batch GLB-to-JT automation is optional until the installed license confirms CLI export works. If Batch is unavailable, export GLB from Kairo and convert manually in CAD Exchanger GUI.
