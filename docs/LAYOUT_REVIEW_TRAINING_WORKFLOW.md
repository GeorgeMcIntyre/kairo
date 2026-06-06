# Layout Review Training Workflow

Last updated: 2026-06-06 (Workbench MVP added)

## Purpose

This workflow turns generated Layout Library records into human-reviewed training truth. It is the layer between deterministic DXF extraction and future AI-assisted live-layout review.

No model training happens in this slice. The output is boring JSON/CSV/Markdown that can be inspected in Git.

Semantic review corrections can now be persisted before the Layout Library package is generated. Use
`kairo-semantic-review-artifact.json` when the viewer's manual class, geometry, or unlink decisions need to be reloaded
against the same staged scene. See `docs/SEMANTIC_REVIEW_ARTIFACT.md`.

The first checked-in Scott/P736 semantic seed fixture is `docs/examples/scott-p736-protected-labels.semantic-review.json`.
It protects known P736 label classifications before full Layout Library training truth is approved.

## Workflow

1. Open a DXF or `.kairo` package in the viewer.
2. If manual semantic corrections were made, export `kairo-semantic-review-artifact.json`.
3. Import a saved semantic review artifact when corrections need to be reapplied.
4. Export `kairo-layout-library-package.json` for the generated package.
5. Export `kairo-layout-review-template.json`.
6. Review the template records and set each record to:
   - `accepted`
   - `corrected`
   - `rejected`
   - `uncertain`
7. Fill reviewer notes and any corrected type or geometry association note/id.
8. Import the reviewed JSON back into the viewer.
9. Export:
   - `reviewed-training-truth.json`
   - `reviewed-training-truth.csv`
   - `reviewed-training-summary.md`
10. On a later layout extraction, import `reviewed-training-truth.json`.
11. Export a comparison report:
   - `training-truth-comparison.json`
   - `training-truth-comparison.csv`
   - `training-truth-comparison.md`
12. Export a reviewed reusable library:
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

The viewer reports the first validation error in the Workbench status area.

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

## Project Workbench

The **Project / Library Workbench** panel (toolbar → Workbench) provides an in-app front-end for the review pipeline. It replaces the need to edit JSON files externally for basic accept/correct/reject/uncertain decisions.

### Workbench workflow

1. Open a DXF or `.kairo` file in the viewer.
2. Click **Workbench** in the toolbar to open the panel.
3. Click **Build Project Package** — this activates in-app review editing from the current layout package.
4. The **Semantic Review Table** shows all detected records with label, type, station, confidence, geometry status, review status, library match, and validation issue count.
5. Use the per-row action buttons to mark records: **Accept**, **Correct** (shows a device-type dropdown), **Reject**, or **Uncertain**.
6. Click **Export Project JSON** to save the full project (source metadata, semantic summary, layout package, review state, and reviewed library) as `kairo-project.json`.
7. Click **Import Project JSON** to restore a saved project — the review pack is restored and in-app editing continues from that state.
8. Click **Build Training Truth** to download the merged `reviewed-training-truth.json`.
9. The **Library Preview** section shows the current reviewed library counts by type/status.

### `editableReviewPack` precedence

In the viewer pipeline, the active review pack is resolved in priority order:

```
importedLayoutReviewPack ?? editableReviewPack ?? blankLayoutReviewPack
```

- An explicitly imported review pack JSON always wins.
- In-app edits (from Build Project Package) are used when no import is active.
- The blank (auto-generated) pack is the fallback when no editing has been done.

With zero edits, the pipeline output is byte-identical to the pre-Workbench behavior.

### KairoProject format

See `docs/LAYOUT_PACKAGE_FORMAT.md` for the `kairo-project` schema reference.

## Current Limits

- Corrected geometry is captured as an id/note; it does not rewrite CAD geometry.
- Training truth is a data artifact only. No AI/model logic consumes it yet.
- Comparison reports are deterministic QA gates, not automatic correction logic.
- The current Scott/P736 semantic seed fixture is classification-focused; ambiguous geometry rows still need visual CAD review before they are trainable truth.
- Reviewer note editing is supported in the JSON schema but does not yet have a text input in the workbench UI.
