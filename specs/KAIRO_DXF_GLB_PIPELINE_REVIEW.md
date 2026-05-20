# Kairo DXF to GLB Pipeline Review

Last updated: 2026-05-20

## Scope

Reviewed the current five production DXFs through:

1. DXF import to Kairo neutral scene.
2. Kairo scene folder write.
3. CAD Exchanger GLB handoff export.
4. GLB header/length validation.
5. CAD Exchanger Batch availability check.

## Scale and Unit Handling

- All five reviewed DXFs import as `millimeter`.
- GLB handoff export uses `--scale-to-meters`, so generated GLBs declare `outputUnits: "meter"` and `coordinateScale: 0.001`.
- Browser GLB export now scales all supported Kairo units to meters: millimeter, centimeter, meter, inch, and foot.
- Bulged polylines now contribute their sampled arc extents to Kairo core bounds, so fit/outlier sizing is not based only on chord endpoints.

## Scene Writer Fix

The DTP file exposed a large-scene serialization failure in the exploded scene writer:

```text
Invalid string length
```

Root cause: large geometry/source-map JSON was being built as one string. The writer now:

- splits oversized curve geometry documents into 50,000-entity parts;
- rewrites scene node geometry references to those part IDs;
- streams `source-map.json` entry-by-entry.

This keeps the existing scene-folder based GLB handoff path working for the large DTP layout.

## Five-File GLB Pipeline Results

Outputs were written under:

```text
C:\tmp\kairo-glb-pipeline
```

| DXF | Conversion | Units -> GLB Units | Curve Entities | Line Segments | Lines GLB | Ribbon GLB |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| DSP-B-01-7B | 100.0000% | mm -> m | 279,500 | 941,769 | 22.34 MB | 64.99 MB |
| KCTP-B-01-7G | 100.0000% | mm -> m | 578,170 | 2,471,289 | 58.61 MB | 170.19 MB |
| DTP-B-01-3X | 100.0000% | mm -> m | 2,284,241 | 6,395,639 | 150.09 MB | 440.11 MB |
| KCT-B-01-8X | 100.0000% | mm -> m | 369,026 | 1,916,923 | 44.11 MB | 131.82 MB |
| KCTP-B-01-7C | 100.0000% | mm -> m | 145,268 | 483,019 | 11.44 MB | 33.27 MB |

Each file generated:

- `*.materials.lines.glb`
- `*.pro.lines-keytext.glb`
- `*.pro.ribbons-keytext.glb`
- `*.cadex-summary.json`
- `*.scene\`

All generated GLBs passed binary header/length checks.

## CAD Exchanger Batch Check

CAD Exchanger is installed at:

```text
C:\Program Files\CAD Exchanger
```

`ExchangerConv.exe` is present and recognizes GLB input and JT output, but the installed CAD Exchanger Batch is not licensed:

```text
Apparently you do not have valid evaluation or production license.
```

Therefore the automated GLB-to-JT conversion step is blocked by licensing on this machine. Manual CAD Exchanger GUI validation or a valid Batch license is still required to prove GLB import and JT export inside CAD Exchanger.

