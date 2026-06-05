# Layout Review Training Workflow

Last updated: 2026-06-05

## Purpose

This workflow turns generated Layout Library records into human-reviewed training truth. It is the layer between deterministic DXF extraction and future AI-assisted live-layout review.

No model training happens in this slice. The output is boring JSON/CSV/Markdown that can be inspected in Git.

## Workflow

1. Open a DXF or `.kairo` package in the viewer.
2. Export `kairo-layout-library-package.json` for the generated package.
3. Export `kairo-layout-review-template.json`.
4. Review the template records and set each record to:
   - `accepted`
   - `corrected`
   - `rejected`
   - `uncertain`
5. Fill reviewer notes and any corrected type or geometry association note/id.
6. Import the reviewed JSON back into the viewer.
7. Export:
   - `reviewed-training-truth.json`
   - `reviewed-training-truth.csv`
   - `reviewed-training-summary.md`
8. On a later layout extraction, import `reviewed-training-truth.json`.
9. Export a comparison report:
   - `training-truth-comparison.json`
   - `training-truth-comparison.csv`
   - `training-truth-comparison.md`
10. Export a reviewed reusable library:
   - `reviewed-layout-library.json`
   - `reviewed-layout-library.csv`
   - `reviewed-layout-library.md`

## Review Pack

Schema:

```json
{
  "schema": "kairo-layout-review-pack",
  "schemaVersion": 1
}
```

Each record captures:

- generated package and source layout identity
- detected item id and label
- detected device type
- corrected device type, when applicable
- detected geometry association
- corrected geometry association id/note, when applicable
- confidence and evidence
- review status
- reviewer note
- reviewed timestamp and review version

## Merge Rules

| Review status | Training truth behavior |
|---|---|
| `accepted` | Keeps generated type and association. Record is trainable. |
| `corrected` | Uses corrected device type and/or corrected geometry note/id. Record is trainable. |
| `rejected` | Preserved in truth package, but marked excluded from training. |
| `uncertain` | Preserved as review-only and not trainable. |

## Validation

Import is schema-safe and deterministic. Invalid review packs fail before merge.

Validation checks include:

- schema and schema version
- required string/number/array fields
- valid Kairo device type enums
- valid review statuses
- valid geometry association statuses
- duplicate review records
- detected item IDs that do not exist in the generated training pack

The viewer reports the first validation error in the semantic panel status area.

## Truth Reuse

Reviewed truth can be imported back into the viewer and compared against the current generated Layout Library package.

Comparison statuses:

| Status | Meaning |
|---|---|
| `matched` | Generated label/type/geometry matches trainable reviewed truth. |
| `missing` | A trainable reviewed truth record is not present in the generated package. |
| `type-mismatch` | The generated device type does not match the reviewed final type. |
| `geometry-mismatch` | The generated geometry association does not match reviewed truth geometry. |
| `excluded` | Reviewed truth says the record is rejected and not trainable. |
| `review-only` | Reviewed truth keeps the record for manual review only. |
| `extra` | Generated package contains a record not present in reviewed truth. |

## Reviewed Library Export

The reviewed library export converts trainable reviewed truth records into reusable item records.

Rules:

- `accepted` and `corrected` records become reusable reviewed library items.
- Corrected device types override the generated item type.
- Equipment metadata is remapped from the final reviewed type when possible.
- Rejected records are preserved as excluded records and are not reusable items.
- Uncertain records are preserved as review-only records and are not reusable items.

Schema:

```json
{
  "schema": "kairo-reviewed-layout-library",
  "schemaVersion": 1
}
```

## Current Limits

- Review packs are session imports; they are not persisted in a project database yet.
- Reviewer editing is done in JSON outside the viewer.
- Corrected geometry is captured as an id/note; it does not rewrite CAD geometry.
- Training truth is a data artifact only. No AI/model logic consumes it yet.
- Comparison reports are deterministic QA gates, not automatic correction logic.
