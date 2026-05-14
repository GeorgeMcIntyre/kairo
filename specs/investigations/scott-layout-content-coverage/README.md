# Scott Layout Content Coverage

This report is machine-generated from the staged Kairo scene and optional raw DXF audit. It is intended to help Scott review whether expected layout content is being found.

**Manual visual geometry confirmation is still pending.**

## Source

- Scene source file: DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf
- Raw DXF audit file: DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf
- Local machine paths and timestamps are intentionally omitted.

## Kairo Import Counts

- Validation: pass (0 errors, 0 warnings, 0 infos)
- Geometry documents: 28
- Geometry entities: 246045
- Source-map rows: 246046
- Layers: 160
- Text labels: 1092
- Semantic stations: 14
- Semantic devices/items: 116
- Linked semantic items: 36
- Ambiguous semantic items: 80
- Unlinked semantic items: 0

## Imported Entity Types

- arc: 8700
- circle: 1035
- line: 191577
- polyline: 43641
- text: 1092

## Raw DXF Audit Counts

- Parser ok: true
- DXF layers: 160
- INSERT entities: 602
- Unique INSERT block names: 214
- BLOCK definitions: 307
- Nested INSERTs inside blocks: 314
- TEXT: 148
- MTEXT: 0
- ATTDEF: 261
- ATTRIB: 0
- Hard-transform blocked INSERTs: 108

## Semantic Device Types

- device_number: 44
- dunnage: 4
- lift_tilt: 4
- nest: 10
- pdp_panel: 5
- robot_model: 22
- service_drop: 16
- station_device_tag: 11


## Top Layers By Entity Count

| Layer | Entities | Text | Line | Polyline | Circle | Arc |
|---|---:|---:|---:|---:|---:|---:|
| 0-Q-GENCOPA | 128259 | 102 | 114932 | 6715 | 192 | 6318 |
| 0 | 36273 | 18 | 32509 | 3297 | 173 | 276 |
| section | 23498 | 0 | 0 | 23498 | 0 | 0 |
| 0-D-MACH-PROD-GAGE | 12085 | 0 | 12080 | 5 | 0 | 0 |
| E-CTRY-FLR | 8748 | 0 | 8736 | 4 | 0 | 8 |
| 0-Q-GENPRTO | 7934 | 34 | 6764 | 88 | 328 | 720 |
| 0-C-FEN | 7637 | 535 | 1951 | 4221 | 8 | 922 |
| outline | 5328 | 0 | 0 | 5328 | 0 | 0 |
| G-ANNO-TTLB | 5279 | 130 | 5002 | 91 | 0 | 56 |
| 0-Q-GENRO | 4565 | 89 | 3896 | 46 | 318 | 216 |
| 0-E-EQPM-PANL | 2575 | 59 | 2173 | 155 | 4 | 184 |
| 0-D-MACH-PROD-GAGE-RefEdit0 | 2417 | 0 | 2416 | 1 | 0 | 0 |
| AIR RIPS | 684 | 12 | 672 | 0 | 0 | 0 |
| 0-Q-MTLONST | 428 | 48 | 364 | 16 | 0 | 0 |
| 0-Q-GENRO-WRK | 98 | 0 | 0 | 98 | 0 | 0 |
| FG-FENCE | 72 | 0 | 36 | 24 | 12 | 0 |
| 0-Q-GENEQSA | 44 | 0 | 16 | 28 | 0 | 0 |
| 0-A-ANNOT-T | 38 | 24 | 14 | 0 | 0 | 0 |
| G-ANNO-TTLB-APPR | 22 | 11 | 11 | 0 | 0 | 0 |
| 0-E-CTRY-OVHD | 19 | 0 | 0 | 19 | 0 | 0 |

## Coverage Risks

| Risk | Severity | Count | Details | Reviewer result | Reviewer notes |
|---|---|---:|---|---|---|
| BLOCK_TEXT_SKIPPED | warning | 20 | Some partially expanded blocks contain text/attributes that were skipped. |  |  |
| HARD_TRANSFORM_BLOCKED_INSERTS | warning | 108 | Some INSERTs have non-uniform or negative transforms that are not fully expanded. |  |  |
| NESTED_INSERTS_PRESENT | warning | 314 | Nested INSERTs exist in source blocks and may need targeted import review. |  |  |
| SEMANTIC_REVIEW_REQUIRED | warning | 1 | 80 device label(s) have ambiguous nearby geometry. |  |  |
| SEMANTIC_REVIEW_REQUIRED | warning | 1 | 948 text label(s) are unclassified. |  |  |

## Files

- `layers.csv`
- `labels.csv`
- `semantic-items.csv`
- `dxf-blocks.csv`
- `coverage-risks.csv`
