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

## Example

See `docs/examples/p736-layout-library-package.sample.json` for a compact package example using the known P736 labels.
