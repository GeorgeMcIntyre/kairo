# DXF POLYLINE Policy

Date: 2026-06-06

## Scope

This policy covers legacy DXF `POLYLINE` entities, not `LWPOLYLINE`.

Kairo's goal for the importer is deterministic layout-review geometry, not a full CAD kernel. A `POLYLINE` variant is supported only when it can be represented honestly as an existing neutral-scene curve polyline without inventing topology or running spline/mesh fitting math.

## Current Behavior

Supported today:

- Simple legacy `POLYLINE` vertex chains with at least two vertices.
- Closed simple legacy `POLYLINE` chains via the existing closed flag.
- Spline-fit `POLYLINE` entities only when the parser exposes usable fitting vertices: vertex flag `8`, excluding frame-control vertices with flag `16`.
- Curve-fit `POLYLINE` entities only when the parser exposes usable generated curve vertices: vertex flag `1`.
- Spline-fit and curve-fit imports emit `DXF_POLYLINE_SPLINE_APPROXIMATED` because the importer is using pre-sampled DXF vertices rather than reconstructing the original fitted curve.
- The same rules apply when the `POLYLINE` appears inside expanded blocks.

Unsupported today:

- Spline-fit or curve-fit `POLYLINE` with no usable generated/fitting vertices.
- Legacy `POLYLINE` with bulge values.
- 3D `POLYLINE` flag.
- Polygon mesh flag.
- Polyface mesh flag.
- Any variant with fewer than two usable vertices.

Unsupported variants emit `DXF_POLYLINE_UNSUPPORTED` with a reason such as `spline-fit POLYLINE has no usable fitting vertices`, `mesh flag`, `polyface flag`, or `bulge values`.

## Policy

### Simple 2D Vertex Chains

Keep importing these as neutral-scene `polyline` entities.

Reason: this is a direct representation with deterministic ordering and no approximation beyond the neutral scene's existing polyline shape.

### Spline-Fit and Curve-Fit

Keep the current pre-sampled-vertices policy:

- Import only parser-exposed generated/fitting vertices.
- Do not use frame/control vertices as rendered geometry.
- Do not implement B-spline or curve-fit reconstruction from control points.
- Emit `DXF_POLYLINE_SPLINE_APPROXIMATED` every time this fallback is used.
- If fewer than two usable generated/fitting vertices exist, skip and emit `DXF_POLYLINE_UNSUPPORTED`.

Reason: the DXF file already contains sampled vertices that AutoCAD generated on the fitted curve. Using them is deterministic and reviewable. Reconstructing splines independently would introduce tolerance, knot, and fit-method decisions that are outside the importer MVP.

### Bulge Values

Keep legacy `POLYLINE` bulge values unsupported for now.

Future allowed path: convert each bulged segment to the same neutral arc approximation policy used elsewhere, but only after adding focused tests for positive/negative bulge, closed chains, mirrored block transforms, and source-map stability.

Not allowed now: silently dropping bulge, importing the chord as if it were exact, or emitting an approximation warning that does not identify the original handle.

### 3D POLYLINE

Keep unsupported unless the entity is proven to be a planar 2D chain in the source file and a narrow deterministic flattening rule is approved.

Future allowed path: add a read-only audit first. If all points share the same Z within tolerance, import as a 2D/3D neutral polyline using existing point coordinates and emit a deterministic flattening or 3D-chain warning as appropriate.

Not allowed now: projecting arbitrary 3D geometry into XY or treating 3D manufacturing geometry as layout-review truth.

### Polygon Mesh and Polyface Mesh

Keep unsupported in the DXF importer.

Future allowed path: handle these only through a mesh-capable import/export feature with explicit neutral-scene mesh semantics, material/layer policy, normals/index handling, and viewer rendering tests.

Not allowed now: converting mesh/polyface edges into drawing polylines just to increase entity counts. That would lose face semantics and can create misleading layout geometry.

## Scott DXF2013 Impact

The current Scott status records:

- `DXF_POLYLINE_SPLINE_APPROXIMATED`: 15
- `DXF_POLYLINE_UNSUPPORTED`: 0 in the current known warning buckets

So there is no known Scott production-run blocker from unsupported complex `POLYLINE` variants at the moment. The policy is still useful because future DXFs may contain mesh, polyface, 3D, bulged, or under-sampled fit polylines.

## Acceptance Rules For Future Changes

Any future POLYLINE expansion must include:

- A dedicated importer unit test for the exact DXF flag/vertex pattern.
- A deterministic warning when approximation or flattening is used.
- Source-map coverage preserving the original `POLYLINE` handle.
- A Scott fixture import comparison if the change affects the primary layout.
- No neutral-scene schema change unless the target geometry cannot be represented honestly by existing curve entities.

## Stop Rule

Do not broaden `POLYLINE` support to mesh, polyface, arbitrary 3D, or spline reconstruction without a separate audit and explicit approval.
