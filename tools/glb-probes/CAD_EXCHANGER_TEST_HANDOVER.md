# CAD Exchanger Test Handover

## Generate And Inspect

From the repo root:

```powershell
node tools\glb-probes\build-probe.mjs
node tools\glb-probes\inspect-glb-probe.mjs
```

## File To Open

Open this exact file in CAD Exchanger:

```text
tools\glb-probes\probe-output.glb
```

Do not touch `packages/exporter-glb` until the CAD Exchanger and JT result table below is filled in.

## GLB Checks In CAD Exchanger

1. Confirm these nodes appear in the model tree:
   - `probe_01_LINES_red_layer_a`
   - `probe_02_LINE_STRIP_green_layer_b`
   - `probe_03_TRIANGLES_blue_layer_c`
   - `probe_04_TRIANGLE_STRIP_red_layer_a`
   - `probe_05_RIBBON_LINE_blue_layer_c`
   - `probe_06_ARC_24_LINE_STRIP_green_layer_b`
   - `probe_07_CIRCLE_32_LINE_STRIP_red_layer_a`
   - `probe_08_SUBMM_0p1_LINE_green_layer_b`
   - `probe_09_FAR_ORIGIN_LINE_blue_layer_c`
   - `probe_10_MULTI_MATERIAL_PRIMITIVES`
2. Confirm native `LINES` are visible.
3. Confirm native `LINE_STRIP` objects are visible.
4. Confirm `TRIANGLES` and `TRIANGLE_STRIP` meshes are visible.
5. Confirm the ribbon mesh fallback is visible as a thin blue strip.
6. Confirm the 24-segment arc and 32-segment circle look correct.
7. Confirm red, green, and blue materials survive.
8. Check whether node names, mesh names, material names, and extras/layer metadata are inspectable.
9. Measure if possible:
   - `probe_08_SUBMM_0p1_LINE_green_layer_b`: 0.1 mm line
   - `probe_09_FAR_ORIGIN_LINE_blue_layer_c`: near `[110000, 90000, 0]`, 20 mm long
   - `probe_05_RIBBON_LINE_blue_layer_c`: 10 mm long, 0.2 mm wide

## JT Export Checks

1. Export/convert the opened GLB to JT using CAD Exchanger.
2. Reopen the JT in CAD Exchanger or a JT viewer.
3. Repeat all visibility checks:
   - LINES
   - LINE_STRIP
   - TRIANGLES
   - TRIANGLE_STRIP
   - ribbon fallback
   - arc
   - circle
   - sub-mm line
   - far-origin line
4. Recheck colors/materials.
5. Recheck object names and any metadata/layer information.
6. Repeat measurements for sub-mm, far-origin, and ribbon fallback items.

## Compact Result Table

Fill with `Y`, `N`, or `?`.

| Item | GLB visible | JT visible | Color OK | Name OK | Metadata/layer OK | Measure OK | Notes |
|---|---|---|---|---|---|---|---|
| LINES mode 1 |  |  |  |  |  | N/A |  |
| LINE_STRIP mode 3 |  |  |  |  |  | N/A |  |
| TRIANGLES mode 4 |  |  |  |  |  | N/A |  |
| TRIANGLE_STRIP mode 5 |  |  |  |  |  | N/A |  |
| Ribbon mesh fallback |  |  |  |  |  |  |  |
| 24-segment arc strip |  |  |  |  |  |  |  |
| 32-segment circle strip |  |  |  |  |  |  |  |
| 0.1 mm line |  |  |  |  |  |  |  |
| Far-origin line |  |  |  |  |  |  |  |
| Three materials/layers | N/A | N/A |  |  |  | N/A |  |
| KHR_materials_unlit |  |  |  | N/A | N/A | N/A |  |
| Multi-material mesh |  |  |  |  |  | N/A |  |

## Decision Rules

### True Line Exporter

Use a true line exporter later only if:

- `LINES` and `LINE_STRIP` are visible in CAD Exchanger.
- `LINES` and `LINE_STRIP` survive JT export.
- Colors/materials survive well enough for layer review.
- Names or metadata survive well enough to identify layer/source grouping.
- Far-origin and 0.1 mm checks are acceptable.

### Ribbon Mesh Exporter

Use ribbon mesh fallback later if:

- Native `LINES` or `LINE_STRIP` disappear in CAD Exchanger or JT.
- Native line colors/materials are dropped but mesh colors/materials survive.
- Native lines cannot be selected or measured, but ribbon meshes can.
- CAD/JT consumers preserve mesh topology more reliably than curve primitives.

### Hybrid Exporter

Use a hybrid exporter later if:

- Native lines survive for visual review, but some CAD/JT workflows need selectable or measurable geometry.
- `LINES`/`LINE_STRIP` are good for lightweight viewing, while ribbon fallback is needed for critical layers.
- Far-origin or sub-mm precision differs between native lines and mesh ribbons.

## Stop Rule

Do not modify `packages/exporter-glb`, production exporter logic, viewer, importer, schema, or JT code until this table is filled in and the exporter direction is chosen from actual CAD Exchanger/JT results.
