# CAD Exchanger GLB Probe

This is a standalone compatibility probe for CAD Exchanger and downstream JT conversion behavior. It is not the Kairo exporter and does not prove an exporter design until George records CAD Exchanger results.

## Generate

From the repo root:

```powershell
node tools/glb-probes/build-probe.mjs
```

Output:

```text
tools/glb-probes/probe-output.glb
```

No package script is added because the repo has no existing one-off tool script pattern.

## Probe Contents

The GLB contains named nodes for:

1. `probe_01_LINES_red_layer_a`
2. `probe_02_LINE_STRIP_green_layer_b`
3. `probe_03_TRIANGLES_blue_layer_c`
4. `probe_04_TRIANGLE_STRIP_red_layer_a`
5. `probe_05_RIBBON_LINE_blue_layer_c`
6. `probe_06_ARC_24_LINE_STRIP_green_layer_b`
7. `probe_07_CIRCLE_32_LINE_STRIP_red_layer_a`
8. `probe_08_SUBMM_0p1_LINE_green_layer_b`
9. `probe_09_FAR_ORIGIN_LINE_blue_layer_c`
10. `probe_10_MULTI_MATERIAL_PRIMITIVES`

The file uses `KHR_materials_unlit`, three materials (`layer_a_red`, `layer_b_green`, `layer_c_blue`), and `extras` metadata on nodes, meshes, primitives, materials, and the scene.

## Manual CAD Exchanger Checklist

1. Open `tools/glb-probes/probe-output.glb` in CAD Exchanger.
2. Confirm every named probe node appears in the model tree.
3. Confirm each primitive is visible:
   - LINES
   - LINE_STRIP
   - TRIANGLES
   - TRIANGLE_STRIP
   - ribbon mesh fallback
   - 24-segment arc
   - 32-segment closed circle
   - 0.1 mm line
   - far-origin line near `[110000, 90000, 0]`
4. Confirm red, green, and blue materials are visible.
5. Check whether material names, node names, mesh names, and `extras` metadata are inspectable.
6. Convert/export to JT using CAD Exchanger.
7. Reopen the JT and repeat visibility, material, naming, metadata, and measurement checks.
8. Measure if possible:
   - `probe_08_SUBMM_0p1_LINE_green_layer_b`: 0.1 mm length
   - `probe_09_FAR_ORIGIN_LINE_blue_layer_c`: location near `[110000, 90000, 0]` and 20 mm length
   - `probe_05_RIBBON_LINE_blue_layer_c`: 10 mm length and 0.2 mm width

## Result Matrix

George fills this in after CAD Exchanger and JT checks.

| Probe Item | GLB visible in CAD Exchanger | JT visible after conversion | Color preserved | Name preserved | Metadata/extras preserved | Measurement OK | Notes |
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

## Stop Conditions

- Stop if CAD Exchanger cannot open the GLB.
- Stop if a glTF validator reports the GLB is invalid.
- Stop if line primitives render in a GLB viewer but disappear in CAD Exchanger.
- Stop if JT conversion silently drops all curve primitives.
- Stop if metadata/layer names are not inspectable; do not assume layer preservation.
- Stop before writing any Kairo exporter logic.
- Stop before changing `packages/exporter-glb`.
- Stop before making assumptions about JT until George records CAD Exchanger results.

## Interpreting Results

A future LINES exporter is only viable if native `LINES` are visible in CAD Exchanger, survive JT conversion, preserve usable color/material grouping, and keep enough naming or metadata to recover layer/source context.

Use ribbon mesh fallback later if native lines disappear, are not selectable/measurable, lose materials while mesh materials survive, or do not survive JT conversion.
