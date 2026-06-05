# Kairo Layout Package Format

Last updated: 2026-06-05

## Schema

Current schema:

```json
{
  "schema": "kairo-layout-library-package",
  "schemaVersion": 1
}
```

The package is intended for deterministic review and future training data, not direct CAD authoring.

Manual semantic corrections can be persisted separately before package generation through
`kairo-semantic-review-artifact.json`. See `docs/SEMANTIC_REVIEW_ARTIFACT.md`.

## Top-Level Fields

| Field | Purpose |
|---|---|
| `source` | Source DXF/package metadata: path, display name, units, axis system. |
| `extractedLabels` | Text labels extracted from the source layout. |
| `deviceClassifications` | Device labels classified into Kairo device types and equipment mappings. |
| `geometryAssociations` | Linked DXF entities or unresolved geometry association status for each device. |
| `stationCellGroupingCandidates` | Detected line/station grouping records. |
| `libraryItemCandidates` | Reusable item candidates with footprint, clearance, padded bounds, and source entity IDs. |
| `trainingPack` | Reviewer-facing records for accepted/corrected/rejected/uncertain training data. |
| `bomRows` | Advanced Engineering count rows reused from the current export model. |
| `summary` | Counts for fast validation. |

## Required MVP Types

The TypeScript model lives in `apps/viewer/src/layoutLibrary/layoutPackage.ts` and includes:

- `LayoutPackage`
- `LayoutLibraryItem`
- `LayoutTrainingRecord`
- `DeviceClassification`
- `GeometryAssociation`
- `ReviewStatus`

## Training Pack Contract

Each `LayoutTrainingRecord` captures:

| Field | Meaning |
|---|---|
| `detectedItemId` | Source semantic/Advanced Engineering device ID. |
| `detectedLabel` | Label found in the DXF. |
| `detectedItemType` | Current detected Kairo device type. |
| `expectedItemType` | Expected/correct type for training; initially equals detected type. |
| `correctedItemType` | Future reviewer correction field. |
| `confidence` | Current deterministic confidence. |
| `reason` | Evidence used to classify or associate the item. |
| `reviewerStatus` | `accepted`, `corrected`, `rejected`, or `uncertain`. |
| `notes` | Reviewer/training note. |
| `sourceEntityIds` | Text and geometry IDs backing the record. |
| `linkedLibraryItemId` | Candidate reusable item generated from the record. |

## Export Formats

- JSON: machine-readable package for future ingestion.
- Markdown: George-facing review report.
- CSV: quick spreadsheet check of labels, classifications, geometry, library items, and training rows.

Viewer download names:

- `kairo-layout-library-package.json`
- `kairo-layout-library-package.csv`
- `kairo-layout-library-package.md`

## Review Pack Format

Review template export:

- `kairo-layout-review-template.json`

Schema:

```json
{
  "schema": "kairo-layout-review-pack",
  "schemaVersion": 1
}
```

Each review record includes:

| Field | Meaning |
|---|---|
| `detectedItemId` | Generated training record item ID. |
| `detectedLabel` | Label found in the source layout. |
| `detectedDeviceType` | Generated Kairo device type. |
| `correctedDeviceType` | Reviewer-corrected type, when status is `corrected`. |
| `detectedGeometryAssociation` | Generated geometry association status and entity IDs. |
| `correctedGeometryAssociationId` | Reviewer-selected association ID, when known. |
| `correctedGeometryAssociationNote` | Reviewer note for geometry correction. |
| `confidence` | Generated confidence. |
| `evidence` | Generated reason/evidence. |
| `reviewStatus` | `accepted`, `corrected`, `rejected`, or `uncertain`. |
| `reviewerNote` | Human review note. |
| `reviewedAt` | Review timestamp string. |
| `reviewVersion` | Numeric review schema version for the record. |

## Reviewed Training Truth

Merged export names:

- `reviewed-training-truth.json`
- `reviewed-training-truth.csv`
- `reviewed-training-summary.md`

Schema:

```json
{
  "schema": "kairo-reviewed-training-truth",
  "schemaVersion": 1
}
```

Merge behavior:

- `accepted` records are trainable and keep the generated type/association.
- `corrected` records are trainable and use corrected type/association fields.
- `rejected` records are retained but marked `excluded`.
- `uncertain` records are retained as `review-only`.

## Training Truth Comparison

Comparison export names:

- `training-truth-comparison.json`
- `training-truth-comparison.csv`
- `training-truth-comparison.md`

Schema:

```json
{
  "schema": "kairo-training-truth-comparison",
  "schemaVersion": 1
}
```

Comparison records use these statuses:

- `matched`
- `missing`
- `type-mismatch`
- `geometry-mismatch`
- `excluded`
- `review-only`
- `extra`

This report lets Kairo check a new/generated Layout Package against a saved reviewed truth package without introducing model logic.

## Reviewed Layout Library

Reviewed reusable library export names:

- `reviewed-layout-library.json`
- `reviewed-layout-library.csv`
- `reviewed-layout-library.md`

Schema:

```json
{
  "schema": "kairo-reviewed-layout-library",
  "schemaVersion": 1
}
```

The reviewed library includes:

- reusable `items` built only from trainable accepted/corrected truth records
- `reviewOnlyRecords` retained for uncertain records
- `excludedRecords` retained for rejected records
- summary counts by item type and review outcome

This is the first durable shape for a human-approved Kairo object library extracted from DXF layout intelligence.

## Example

See `docs/examples/p736-layout-library-package.sample.json` for a compact package example using the known P736 labels.
