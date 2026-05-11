# Kairo Semantic Overlay Validation

## Goal

The semantic overlay is a viewer-only validation/debug layer for checking station anchors, device candidates, station associations, unknown labels, and outlier behavior before any persistence or user-confirmed project model exists.

## Overlay Behavior

`Semantic overlay` adds lightweight SVG markup over the existing Three.js canvas:

- station markers at detected station label positions
- device candidate bounds from semantic grouping
- association lines from station candidates to device candidates
- selected source text markers
- selected bounds highlight
- optional unknown-label markers

The overlay does not create Three.js geometry and does not mutate scene data.

## Validation Panel

When enabled, the compact validation panel provides:

- station ID search
- device candidate type filter
- minimum confidence filter
- unknown label toggle
- unassigned candidate toggle
- Fit main
- Fit raw
- Show outliers

The panel lists station candidates and device candidates. Device rows use candidate wording only: detected candidate, heuristic match, or device candidate. Nothing is treated as confirmed until a later persistence/user-confirmation model exists.

## Station Validation

Select a station candidate from the panel or overlay marker to inspect:

- station ID
- process name
- side
- confidence
- source text IDs
- nearby grouped geometry count
- bounds

Associated device candidate bounds and lines are highlighted for quick visual review.

## Device Candidate Validation

Select a device candidate from the panel or overlay bounds to inspect:

- candidate type
- source text/name
- parent or nearest station association
- confidence
- source text IDs
- nearby grouped geometry count
- evidence strings

Extended tags are parsed as candidates, not stations:

- `7B-020L-04` -> `device_number`
- `7B-070L-DN1` / `7B-070L-DN2` -> `dunnage`
- `7B-060L-1N` -> `nest`

## Outlier Sanity

The panel includes:

- outlier count
- top layers containing outliers
- top farthest outliers
- Show outliers toggle

`Fit main` continues to use robust `fitBounds`; `Fit raw` includes all geometry.

## Limitations

- Geometry highlighting is bounds-based. Individual nearby DXF curve entities are tracked by ID, but the current batched renderer does not recolor each tracked entity separately.
- Device candidates are heuristic and text-driven.
- Association lines show semantic inference, not CAD ownership.
- Unknown labels are preserved for review but not classified.
- No persistence or confirmed status exists yet.

## Next Step Toward Persistence

Add a user-confirmed semantic model with explicit review actions:

- confirm station
- reject station
- confirm device candidate
- reassign parent station
- persist validated semantic entities separately from imported DXF source data
