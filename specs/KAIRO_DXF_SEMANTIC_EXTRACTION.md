# Kairo DXF Semantic Extraction

## Goal

Kairo now starts to interpret large automotive DXF layouts as station-oriented drawings instead of only raw geometry. The first pass uses DXF text labels as station anchors, then groups nearby curve geometry into low-confidence device candidates.

## Station Label Detection

The parser detects labels with this shape:

- `7B-010L LOAD & SPAC`
- `7B-020R GEO & SPAC`
- `7B-030L RESPOT RIVET`

The parsed fields are:

- `stationId`: full identifier, for example `7B-010L`
- `linePrefix`: line or zone prefix, for example `7B`
- `stationNumber`: three-digit station number, for example `010`
- `side`: `L` or `R`
- `processName`: remaining process text, for example `LOAD & SPAC`

Labels can arrive as a single text entity or as nearby split text entities. The first implementation merges a standalone station ID with the nearest process text when it is close enough in drawing coordinates.

## Text Extraction

Semantic extraction reads existing neutral-scene text entities from curve-set geometry. It preserves:

- text
- position
- rotation
- height
- layer
- entity ID
- source ref
- bounds

No importer/schema change is required for this first pass.

## Geometry Grouping

Each station anchor groups nearby non-text curve entities inside a configurable X/Y window. The viewer passes the robust bounds classifier, so entities already classified as outliers are excluded from normal station grouping.

This is intentionally heuristic. It should help identify likely station neighborhoods without claiming CAD-level assembly structure.

## Device Candidate Rules

Device classification is first-pass and low confidence:

- robot: protected P736 robot tags such as `7B-020L-04`, robot layer/block hints, or robot model labels
- dunnage station: station-device suffixes such as `DN1` / `DN2`, including protected P736 tags `7B-070L-DN1` and `7B-070L-DN2`
- nest: station-device suffixes such as `1N`, including protected P736 tag `7B-060L-1N`
- fixture/tooling: gage, fixture, tool, or machine layer hints
- conveyor/line rail: conveyor, rail, or carrier layer hints
- guarding/fence: fence or guard layer hints
- operator/load area: load or operator layer hints
- unknown: everything else

Confidence remains conservative until manual CAD validation proves stronger rules.

## QA Export

The viewer exposes deterministic semantic QA exports from the Semantics panel:

- `Download QA MD`
- `Download QA JSON`

The report lists detected labels, classified device type, linked/candidate geometry entities, confidence/evidence reasons, duplicate labels, unknown labels, and missing/uncertain items.

## Viewer Diagnostics

The existing diagnostics panel lists detected stations with:

- station ID
- process name
- side
- label position
- nearby entity count
- device candidates
- confidence

## Known Limitations

- The extraction is label-anchored; unlabeled stations are not inferred yet.
- It groups by drawing proximity, not by real CAD ownership.
- Device classification uses layer/name/geometry hints only.
- Protected P736 labels are exact-match rules for the current review slice and should be promoted to data/config once more layouts are validated.
- Multi-line merge handles simple nearby split labels, not complex text layouts.
- Results need George visual review against the DXF reference before being treated as production semantics.

## Next Steps

1. Persist reviewed QA decisions and manual semantic overrides.
2. Add visual QA screenshots for detected station anchors and protected P736 labels.
3. Improve grouping with station Voronoi/cell regions instead of fixed windows.
4. Learn stronger device rules from validated layers and block names.
5. Promote protected layout-specific labels into a small config/data layer instead of hard-coding them.
