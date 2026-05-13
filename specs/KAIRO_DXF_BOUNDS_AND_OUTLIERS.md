# Kairo DXF Bounds And Outliers

## Goal

Large DXF layouts can contain title blocks, border geometry, or isolated far-field entities that are valid project data but bad default fit drivers. Kairo keeps those entities in the scene package while preventing them from shrinking the normal viewer fit.

## Bounds Model

The core bounds pass computes:

- `rawBounds`: all curve and text entities.
- `visibleBounds`: all non-outlier entities.
- `fitBounds`: the default camera-fit bounds, currently equal to `visibleBounds`.
- `outlierBounds`: the combined bounds of classified outlier entities.
- `outlierEntityIds`: entity IDs excluded from normal fit and hidden by default.

## Outlier Rules

Entity bounds and centroids are computed without Three.js. The classifier uses a robust median scene centroid and a distance threshold derived from median distance and IQR:

- default distance multiplier: `5`
- default IQR multiplier: `6`
- top outliers are sorted by distance from the main cluster

This avoids the earlier fixed-quantile behavior where the farthest 5% of a legitimate line could be hidden only because it was near the edge.

## Viewer Behavior

- `Fit main` uses `fitBounds`.
- `Fit scene` currently follows the same normal fit behavior.
- `Fit raw` uses `rawBounds` and includes everything.
- Outlier curve/text entities are hidden from the default render batch.
- `Show outliers` rebuilds curve buffers with outliers included.

No geometry is deleted from the project data.

## Diagnostics

Diagnostics report:

- raw bounds
- fit bounds
- outlier bounds
- outlier count
- farthest outlier entities with ID, type, layer, bounds, distance, and size

In dev mode, the same summary is logged to the browser console.

## Known Limitations

- Mesh geometry is not part of robust outlier classification yet.
- The classifier is heuristic. A legitimate remote reference object can still be classified as an outlier, but it remains available through `Show outliers` and `Fit raw`.
- `Fit selected` is still batch-node based unless the selected curve entity is represented by its own render object.

## Next Recommended Work

Add a persisted outlier review report for demo scenes so known title-block and far-field blocks can be inspected, named, and optionally whitelisted by source block or layer after CAD validation.
