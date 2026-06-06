# Coordinate Precision Audit

Last updated: 2026-06-06

This audit checks whether the current Scott DXF staged scene needs viewer-space rebasing before high-zoom review. It is about browser/viewer Float32 precision only; it is not a CAD measurement certification and does not change importer/schema behavior.

## Command

From the repo root:

```powershell
node tools\precision-audit\scene-float32-precision-audit.mjs
```

Optional scene argument:

```powershell
node tools\precision-audit\scene-float32-precision-audit.mjs apps\viewer\public\scenes\scott-dxf2013-import
```

## Current Scott Result

Source:

```text
apps\viewer\public\scenes\scott-dxf2013-import
```

Counts:

| Metric | Value |
|---|---:|
| Geometry documents | 28 |
| Geometries | 28 |
| Lines | 191,577 |
| Polylines | 43,641 |
| Circles | 1,035 |
| Arcs | 8,700 |
| Text entities | 1,092 |
| Sampled coordinate scalars | 1,658,763 |

Bounds:

| Metric | X | Y | Z |
|---|---:|---:|---:|
| Min mm | -852,632.626355 | -101,923.532352 | -6.000000006 |
| Max mm | 955,433.619215 | 104,900.299530 | 14.999996712 |
| Extent mm | 1,808,066.245571 | 206,823.831882 | 20.999996718 |
| Center mm | 51,400.496430 | 1,488.383589 | 4.499998353 |

Coordinate magnitudes:

| Metric | Value |
|---|---:|
| Max absolute coordinate | 955,433.619215 mm |
| p95 absolute coordinate | 98,362.541016 mm |
| p99 absolute coordinate | 106,757.751681 mm |
| p99.9 absolute coordinate | 851,936.583081 mm |

Smallest detected features above the audit cutoff:

| Feature | Value |
|---|---:|
| Line-like segment | 0.001014331 mm |
| Arc/circle radius | 0.010437811 mm |
| Text height | 1.600199998 mm |

Float32 spacing:

| Location | Float32 Spacing |
|---|---:|
| Scene center magnitude | 0.00390625 mm |
| p99 absolute coordinate | 0.0078125 mm |
| p99.9 absolute coordinate | 0.0625 mm |
| Max absolute coordinate | 0.0625 mm |
| 10x max spacing | 0.625 mm |
| 100x max spacing | 6.25 mm |

## Interpretation

Most of the drawing is still inside a coordinate range where Float32 vertex spacing is under 0.01 mm. That is acceptable for current drawing-first visual review, layer isolate QA, semantic QA, and Workbench review.

The staged Scott scene also contains far outlier coordinates near 955 m from origin. At that magnitude, Float32 spacing is 0.0625 mm. That is still visually tolerable for overview work, but it is not a good basis for high-zoom sub-millimeter inspection, precise visual measurement, or future CAD-grade viewer claims.

The current viewer already uses outlier-safe fit behavior, so the outliers do not have to block ordinary drawing review. They should influence future precision work.

## Decision

Do not add viewer-space rebasing before the current manual review pass if the work is limited to:

- drawing-first UI QA
- layer search/isolate QA
- semantic association review
- Workbench review/export
- public demo and `.kairo` package smoke

Plan viewer-space rebasing before any of these become requirements:

- reliable high-zoom inspection of outlier geometry
- sub-0.1 mm visual measurement in the browser
- rendering/selection correctness for scenes near or beyond 1,000,000 mm coordinates
- production digital-twin or CAD-review claims based on browser Float32 geometry

## Proposed Rebase Direction

Keep Kairo scene coordinates unchanged on disk. Apply a viewer-only render origin offset when building Three.js buffers:

1. Choose a render origin from robust scene bounds, not raw outlier bounds.
2. Subtract that origin while packing Float32 vertex buffers.
3. Keep original world coordinates in entity metadata, source maps, and inspector display.
4. Add the render origin back for displayed coordinates and exported references.
5. Keep picking metadata keyed by entity IDs, not by rebased coordinates.

This avoids schema churn while improving GPU precision if high-zoom outlier inspection becomes necessary.
