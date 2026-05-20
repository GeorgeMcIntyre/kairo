# Kairo CAD Exchanger GLB Handoff

This folder is a standalone operator handoff for converting a DXF into GLB files that can be opened in CAD Exchanger and exported to JT.

## Requirements

- Windows
- Node.js
- pnpm
- Kairo repo checkout

## Quick Run

Double-click:

```text
Convert-Scott-DXF-To-GLB.cmd
```

Default input:

```text
C:\Users\georgem\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf
```

Default output folder:

```text
C:\Users\georgem\Downloads\ScottLayouts\kairo-cadex-glb
```

## Run With Explicit Paths

```powershell
.\tools\cadex-handoff\Convert-DxfToCadExchangerGlb.ps1 `
  "C:\Users\georgem\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf" `
  "C:\Users\georgem\Downloads\ScottLayouts\kairo-cadex-glb"
```

## Outputs

The script writes:

- `*.pro.ribbons-keytext.glb`: recommended first CAD Exchanger test
- `*.pro.lines-keytext.glb`: fallback if ribbons are too heavy
- `*.materials.lines.glb`: simplest colored line export
- `*.cadex-summary.json`: export stats
- `*.scene\`: exploded intermediate Kairo scene

Open the recommended GLB in CAD Exchanger, then export JT from CAD Exchanger.

## Notes

- The GLB is a CAD Exchanger handoff, not a native Kairo JT exporter.
- Coordinates are scaled from millimeters to meters for GLB/CAD Exchanger interoperability.
- Text is filtered key stroke text, not full CAD text fidelity.
