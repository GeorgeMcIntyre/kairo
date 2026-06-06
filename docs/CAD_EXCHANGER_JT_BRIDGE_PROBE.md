# CAD Exchanger JT Bridge Probe

Last updated: 2026-06-06

This is a bridge feasibility probe, not a Kairo exporter. It answers one narrow question: can CAD Exchanger carry a simple named colored mesh part into JT, and can JT2Go / Process Simulate still identify the part well enough for review?

Do not treat this as proof that raw JT export, production GLB export, layout export, or CAD Exchanger automation is solved.

## Generate And Inspect

From the repo root:

```powershell
node tools\glb-probes\build-jt-bridge-part-probe.mjs
node tools\glb-probes\inspect-jt-bridge-part-probe.mjs
```

Expected output:

```text
tools\glb-probes\jt-bridge-part-output.glb
```

## Probe Contents

The GLB contains one mesh part:

```text
jt_bridge_probe_named_red_block_100x50x25mm
```

Expected local properties:

| Property | Expected |
|---|---|
| Node count | 1 |
| Mesh count | 1 |
| Material count | 1 |
| Primitive mode | `TRIANGLES` |
| Vertices | 36 |
| Triangles | 12 |
| Dimensions | 100 x 50 x 25 mm |
| Material | `inspection_red_jt_bridge_probe` |
| Metadata | `extras` on scene, node, mesh, primitive, and material |
| Part number | `KAIRO-JT-BRIDGE-PROBE-001` |

The local inspector confirms GLB structure, part naming, material naming/color, dimensions, normals, triangle count, and metadata presence. It does not prove CAD Exchanger, JT2Go, or Process Simulate behavior.

## Manual Bridge Test

George fills this in after running the desktop tools.

1. Open `tools\glb-probes\jt-bridge-part-output.glb` in CAD Exchanger.
2. Confirm the model tree shows `jt_bridge_probe_named_red_block_100x50x25mm`.
3. Confirm the part is red and appears as one solid rectangular block.
4. Check whether the material name, node/mesh name, part number, and `extras` metadata are inspectable.
5. Measure the block if CAD Exchanger allows it: 100 x 50 x 25 mm.
6. Export or convert to JT using CAD Exchanger.
7. Open the JT in JT2Go.
8. Open the same JT in Process Simulate if available.
9. Fill in the matrix below before choosing any bridge/export direction.

## Result Matrix

Fill with `Y`, `N`, or `?`.

| Check | CAD Exchanger GLB | CAD Exchanger Reopened JT | JT2Go | Process Simulate | Notes |
|---|---|---|---|---|---|
| File opens |  |  |  |  |  |
| Single part visible |  |  |  |  |  |
| Part name preserved |  |  |  |  |  |
| Material/color preserved |  |  |  |  |  |
| Part number/metadata preserved |  |  |  |  |  |
| Dimensions measurable |  |  |  |  |  |
| Dimensions approximately 100 x 50 x 25 mm |  |  |  |  |  |
| Origin/orientation acceptable |  |  |  |  |  |
| No unexpected triangulation/display defects |  |  |  |  |  |

## Decision Rules

Use CAD Exchanger as a temporary JT bridge only if:

- CAD Exchanger opens the GLB without repair.
- CAD Exchanger exports a JT that opens in JT2Go.
- The JT opens in Process Simulate or the target downstream tool.
- The part remains visible as one identifiable object.
- Name or metadata survives well enough to map back to Kairo source objects.
- Color survives well enough for review.
- Dimensions remain close enough for engineering inspection.

Do not proceed with bridge/export implementation if:

- JT2Go or Process Simulate cannot open the converted JT.
- The part becomes unnamed or untraceable.
- Color/material grouping is lost and no replacement grouping survives.
- Dimensions or orientation are wrong.
- CAD Exchanger requires manual repair steps that cannot be documented repeatably.

## Stop Rule

Stop before writing any production Kairo exporter, raw JT writer, Cloudflare CAD conversion, or automated CAD Exchanger integration until this matrix is filled in from actual desktop-tool results.
