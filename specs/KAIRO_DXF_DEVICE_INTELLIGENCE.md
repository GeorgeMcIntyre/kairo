# Kairo DXF Device Intelligence

## Goal

Kairo should start interpreting automotive DXF layouts as station and device data, not only as rendered curves. The first intelligence layer is text-driven and conservative.

## Text Extraction

Semantic extraction reads neutral-scene text entities from curve-set geometry. It preserves:

- raw text
- normalized text
- position
- rotation
- text height
- layer
- color
- entity ID
- source ref
- source kind (`TEXT`, `MTEXT`, or `ATTDEF`)
- bounds

MTEXT is represented in the current schema as a text entity with an MTEXT source ref.

## Station Parsing

Station labels match this shape:

- `7B-010L LOAD & SPAC`
- `7B-020R GEO & SPAC`
- `7B-030L RESPOT RIVET`
- `7B-020L`

Parsed fields:

- `stationId`
- `linePrefix`
- `stationNumber`
- `side`
- `processName`

Nearby split station labels can be merged, for example `7B-030L` plus `RESPOT RIVET`.

Only the base station token creates a station anchor. Extended station-device tags must not create stations.

Base station token:

- `^[A-Z0-9]+-\d{3}[LR]$`

Extended station-device tag:

- `^([A-Z0-9]+-\d{3}[LR])-(.+)$`

The prefix before the final dash is the parent `stationId`.

## Device Parsing

Known text classifications:

- `ROBOT CONTROLLER` -> `robot_controller`
- `ROBOT PDP`, `PANEL 400A`, `PDP` -> `pdp_panel`
- `BASE PLATE` -> `base_plate`
- `M/H`, `MATERIAL HANDLING` -> `material_handling_robot_or_tooling`
- `R2000IC-210F` -> `robot_model`
- `RIVET`, `RESPOT` -> `rivet_process`
- `LIFT & TILT` -> `lift_tilt`
- `FENCE PANEL`, `FENCE` -> `fence`
- `CABLE TRAY` -> `cable_tray`
- `DROP` -> `service_drop`
- `7B-020L-04` -> `robot`, parent station `7B-020L`
- `7B-070L-DN1`, `7B-070L-DN2` -> `dunnage`, parent station `7B-070L`
- `7B-060L-1N` -> `nest`, parent station `7B-060L`
- other `station-suffix` tags -> `station_device_tag`

Close text fragments with similar rotation and height can be merged before classification. This supports split labels such as `ROBOT PDP` plus `PANEL 400A`.

Station-device tags are not merged with adjacent text. They remain standalone candidates so their parent station and suffix stay unambiguous.

## Station Association

Device association uses:

- parent station from station-device tags first, such as `7B-020L-02`
- station ID in the device text second
- nearest station second, inside a conservative radius
- `none` if no station association is defensible

The association method is preserved on each device.

## Geometry Grouping

The semantic device layer now creates candidate geometry groups before assigning labels:

- block-insert groups when DXF source refs identify expanded INSERT children
- fallback nearby geometry clusters when no block ownership is available
- outlier entity IDs from the robust bounds pass are excluded from normal semantic grouping

Each text label is associated to the nearest plausible candidate group using:

- distance from label position to group bounds and centroid
- label pattern confidence
- layer/block/name hints where available
- geometry size sanity

The association status is one of:

- `linked` - one candidate is clearly best
- `ambiguous` - multiple nearby candidates are plausible
- `unlinked` - no candidate is close enough

Each semantic device keeps:

- device ID and label text
- class/type
- confidence and evidence
- source text entity IDs
- linked entity IDs
- candidate group IDs with distance/confidence/reasons
- label entity ID(s)
- bounds and centroid
- association status, association confidence, and association reasons

## Confidence Rules

Confidence starts with dictionary confidence, then adjusts for station association and geometry association. Clear nearby geometry can raise confidence. Ambiguous or missing geometry lowers confidence. Kairo should not treat these as CAD ownership facts until validated.

## Debug Output

The diagnostics panel reports:

- detected stations
- detected devices
- device type
- station association
- confidence
- source text
- linked entity IDs
- association status
- association candidates

The viewer semantic panel also exposes session-only overrides for device class and geometry association, plus JSON/Markdown summary exports.

## Known Limitations

- This pass is text-driven. Unlabeled devices are not inferred.
- Geometry grouping is block-provenance/proximity-based, not authoritative CAD assembly ownership.
- Device labels can be duplicated if the drawing repeats notes near multiple views.
- Dictionary rules are intentionally narrow and should be expanded from validated DXF examples.
- User overrides are currently session-only and are not persisted.

## Next Recommended Work

Manually QA semantic associations on the Scott DXF, then follow `specs/KAIRO_SEMANTIC_LAYOUT_MVP_PLAN.md` to add equipment library metadata, footprint/clearance validation, and BOM-oriented exports in small slices.
