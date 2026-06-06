# Frontend Project Workbench

Last updated: 2026-06-06

## Purpose

The Project / Library Workbench is a viewer panel that surfaces the full review pipeline as a usable workflow — from DXF import through semantic review, training truth, and reviewed library export — without requiring the user to edit JSON files externally.

## How to Use

1. Open a DXF or `.kairo` file in the viewer.
2. Click **Workbench** in the toolbar to open the panel.
3. Click **Build Project Package** to activate in-app review editing.
4. Use the review table to inspect and decision each detected record.
5. Export or import project state as needed.

## Panel Sections

### Action Buttons

| Button | Description |
|---|---|
| Build Project Package | Activates in-app editing from the current layout package |
| Export Project JSON | Downloads `kairo-project.json` with all current artifacts |
| Import Project JSON | Restores review state from a saved project file |
| Export Review Artifact | Downloads `kairo-semantic-review-artifact.json` |
| Import Review Artifact | Imports a semantic review artifact |
| Build Training Truth | Downloads `reviewed-training-truth.json` |
| Export Reviewed Library | Downloads the reviewed layout library JSON |
| Export QA Report | Downloads the semantic QA report JSON |

### Semantic Review Table

Shows one row per detected device record with columns:

| Column | Source |
|---|---|
| Label | `detectedLabel` from review pack record |
| Detected Type | `detectedDeviceType` (or `correctedDeviceType *` if corrected) |
| Station | From `layoutPackage.deviceClassifications` by `sourceDeviceId` |
| Confidence | `record.confidence` |
| Geometry | `detectedGeometryAssociation.status`: linked / ambiguous / unlinked |
| Review Status | `reviewStatus`: accepted / corrected / rejected / uncertain |
| Library | `✓` if `linkedLibraryItemId` is set in the training pack |
| Issues | Count of validation issues from `advancedLayoutModel.validationIssues` |

**Per-row actions** (enabled after Build Project Package):
- **Accept** — marks record `accepted`
- **Correct** — shows a device-type `<select>` dropdown; selecting a type sets `correctedDeviceType` and status `corrected`
- **Reject** — marks record `rejected` (excluded from training)
- **Uncertain** — marks record `uncertain` (review-only, not trainable)

### Library Preview

Shows summary counts from the current reviewed layout library:

- **Trainable** — total reusable items (`accepted` + `corrected`)
- **Accepted** — accepted trainable items
- **Corrected** — corrected trainable items
- **Review-only** — uncertain records retained for inspection
- **Excluded** — rejected records excluded from training

Also shows a by-type breakdown and download buttons for JSON/CSV/Markdown.

## KairoProject Schema

Schema identifier: `kairo-project` v1

```json
{
  "schema": "kairo-project",
  "schemaVersion": 1,
  "source": { "displayName": "...", "format": "dxf", "units": "millimeter", "axisUp": "Z", "handedness": "right" },
  "semanticSummary": { "counts": { "stations": 0, "devices": 0, "..." } },
  "layoutPackage": { "schema": "kairo-layout-library-package", "schemaVersion": 1, "..." },
  "semanticReviewArtifact": { "..." },
  "layoutReviewPack": { "..." },
  "reviewedLayoutLibrary": { "..." },
  "createdAt": "1970-01-01T00:00:00.000Z",
  "updatedAt": "1970-01-01T00:00:00.000Z"
}
```

**Design constraints:**
- The full `ScenePackage` (246k geometry entities) is NOT embedded — re-import requires the original DXF or `.kairo` file.
- Timestamps use the epoch constant `"1970-01-01T00:00:00.000Z"` for deterministic, Git-friendly output.
- Optional artifacts (`semanticReviewArtifact`, `layoutReviewPack`, `reviewedLayoutLibrary`) are omitted when not present.

## Pipeline Precedence

The viewer resolves the active review pack in priority order:

```
importedLayoutReviewPack ?? editableReviewPack ?? blankLayoutReviewPack
```

An explicitly imported pack always wins. In-app edits are used when no import is active. The blank auto-generated pack is the fallback. With zero edits, pipeline output is byte-identical to behavior before the Workbench was added.

## Known Limits

- Reviewer note editing exists in the schema (`reviewerNote: string`) but there is no text input in the UI yet.
- The "correct type" action changes device classification but does not yet correct geometry association IDs — use the JSON import path for geometry corrections.
- The workbench panel does not persist state across browser sessions; use Export/Import Project JSON for continuity.
