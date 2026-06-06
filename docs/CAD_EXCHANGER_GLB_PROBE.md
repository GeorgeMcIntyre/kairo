# CAD Exchanger GLB Probe

Last updated: 2026-06-06

This is a compatibility probe, not a production Kairo exporter. It exists to answer whether native glTF line primitives can pass through CAD Exchanger and JT conversion with enough visual fidelity, material grouping, naming, metadata, and coordinate precision to justify future exporter work.

## Generate And Inspect

From the repo root:

```powershell
node tools\glb-probes\build-probe.mjs
node tools\glb-probes\inspect-glb-probe.mjs
```

Expected output:

```text
tools\glb-probes\probe-output.glb
```

## Probe Coverage

The GLB contains:

- `LINES` primitives
- `LINE_STRIP` primitives
- `TRIANGLES` mesh primitive
- `TRIANGLE_STRIP` mesh primitive
- Thin triangle ribbon fallback for line-like geometry
- Red, green, and blue materials standing in for layer grouping
- Named nodes and meshes
- `extras` metadata on scene, nodes, meshes, primitives, and materials
- A 0.1 mm line
- A far-origin 20 mm line near `[110000, 90000, 0]`

## Local Inspector Result

`inspect-glb-probe.mjs` verifies the generated file structure locally before any CAD Exchanger claim:

- GLB 2.0 header and chunk lengths
- JSON and BIN chunk types
- primitive modes 1, 3, 4, and 5
- named nodes, meshes, and materials
- accessor bounds
- far-origin coordinate presence
- 0.1 mm line presence
- `extras` metadata presence

This local inspection proves the probe file is structurally coherent. It does not prove CAD Exchanger or JT behavior.

## Manual CAD Exchanger Result Matrix

George fills this in after opening `tools\glb-probes\probe-output.glb` in CAD Exchanger, exporting/converting to JT, and reopening the JT.

| Probe Item | GLB visible in CAD Exchanger | JT visible after conversion | Color preserved | Name preserved | Metadata/layer preserved | Measurement OK | Notes |
|---|---|---|---|---|---|---|---|
| LINES mode 1 |  |  |  |  |  | N/A |  |
| LINE_STRIP mode 3 |  |  |  |  |  | N/A |  |
| TRIANGLES mode 4 |  |  |  |  |  | N/A |  |
| TRIANGLE_STRIP mode 5 |  |  |  |  |  | N/A |  |
| Ribbon mesh fallback |  |  |  |  |  | Width OK? |  |
| 24-segment arc strip |  |  |  |  |  | Shape OK? |  |
| 32-segment circle strip |  |  |  |  |  | Shape OK? |  |
| 0.1 mm line |  |  |  |  |  | Length OK? |  |
| Far-origin line |  |  |  |  |  | Location OK? |  |
| Three materials/layers | N/A | N/A |  |  |  | N/A |  |
| KHR_materials_unlit |  |  | Appearance OK? | N/A | N/A | N/A |  |
| Multi-material mesh |  |  | Per primitive? | Mesh/primitive? |  | N/A |  |

## Feasibility Rules

Use a native line exporter later only if `LINES` and `LINE_STRIP` are visible in CAD Exchanger, survive JT conversion, preserve usable color/material grouping, and keep enough naming or metadata to recover layer/source context.

Use a ribbon/tube mesh fallback later if native lines disappear, cannot be selected/measured, lose materials while mesh materials survive, or fail JT conversion.

Do not add production GLB/JT exporter logic until this matrix is filled in from actual CAD Exchanger/JT results.
