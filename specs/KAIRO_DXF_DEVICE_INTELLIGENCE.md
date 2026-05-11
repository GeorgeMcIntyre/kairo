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
- `7B-020L-04` -> `device_number`, parent station `7B-020L`
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

Each detected device collects nearby non-text entity IDs and computes combined bounds from the source label and nearby geometry. The device keeps:

- source text entity IDs
- nearby entity IDs
- bounds
- confidence
- evidence strings from the dictionary

Outlier entity IDs from the robust bounds pass are excluded from normal semantic grouping.

## Confidence Rules

Confidence starts with dictionary confidence, then receives a small boost for station association and nearby geometry. Missing station association lowers confidence. Kairo should not treat these as CAD ownership facts until validated.

## Debug Output

The diagnostics panel reports:

- detected stations
- detected devices
- device type
- station association
- confidence
- source text
- nearby entity count

## Known Limitations

- This pass is text-driven. Unlabeled devices are not inferred.
- Geometry grouping is proximity-based, not block ownership or CAD assembly ownership.
- Device labels can be duplicated if the drawing repeats notes near multiple views.
- Dictionary rules are intentionally narrow and should be expanded from validated DXF examples.

## Next Recommended Work

Add selectable station/device overlays, then compare detected stations and devices against manually reviewed DXF screenshots before persisting semantic output.
