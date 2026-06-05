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

## Current Limits

- Review packs are session imports; they are not persisted in a project database yet.
- Reviewer editing is done in JSON outside the viewer.
- Corrected geometry is captured as an id/note; it does not rewrite CAD geometry.
- Training truth is a data artifact only. No AI/model logic consumes it yet.
