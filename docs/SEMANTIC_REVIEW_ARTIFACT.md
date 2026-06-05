# Semantic Review Artifact

The semantic review artifact persists George's viewer-side semantic review decisions as a small JSON file.

It sits before the Layout Library review/training workflow:

1. Kairo extracts semantic devices from the DXF or `.kairo` scene.
2. George applies manual class, geometry association, or unlink corrections in the viewer.
3. The viewer exports `kairo-semantic-review-artifact.json`.
4. The artifact can be imported later against the same staged scene or a compatible extraction.
5. Corrected/rejected rows reapply as semantic overrides before QA, Advanced Engineering, Layout Library, and reviewed-library exports are generated.

No model training happens here. This is deterministic project truth capture for reviewed semantic corrections.

## Export

Viewer button:

```text
Download Semantic Review JSON
```

File name:

```text
kairo-semantic-review-artifact.json
```

Schema:

```json
{
  "schema": "kairo-semantic-review-artifact",
  "schemaVersion": 1,
  "source": {
    "id": "semantic-source-p736.dxf",
    "name": "P736.dxf",
    "path": "layouts/P736.dxf"
  },
  "createdAt": "1970-01-01T00:00:00.000Z",
  "reviewVersion": 1,
  "records": [],
  "summary": {}
}
```

The timestamp is fixed by design so generated artifacts are stable and easy to diff.

## CLI Export

The CLI can generate the same blank review artifact from an exploded scene folder or `.kairo` package:

```powershell
node packages\cli\dist\index.js export-semantic-review apps\viewer\public\scenes\scott-dxf2013-import tmp\scott-semantic-review-artifact.json
```

During local verification on 2026-06-05, the staged Scott/P736 scene exported:

| Count | Value |
|---|---:|
| Devices | 116 |
| Stations | 14 |
| Unknown labels | 948 |
| Accepted records | 36 |
| Corrected records | 0 |
| Rejected records | 0 |
| Uncertain records | 80 |

The generated file in `tmp/` is smoke-test output only. A checked-in reviewed truth fixture should be created after George reviews and corrects the artifact.

## Record Contract

Each record captures one generated semantic device:

| Field | Meaning |
|---|---|
| `deviceId` | Current semantic device ID. |
| `detectedLabel` | Label text Kairo detected. |
| `detectedDeviceType` | Device type Kairo classified. |
| `correctedDeviceType` | Reviewer-corrected device type when changed. |
| `detectedGeometryAssociation` | Original linked/ambiguous/unlinked geometry state. |
| `correctedGeometryGroupId` | Reviewer-selected geometry group when changed. |
| `unlink` | `true` when the reviewer rejected the detected association. |
| `confidence` | Original semantic confidence. |
| `evidence` | Detection and association reasons. |
| `reviewStatus` | `accepted`, `corrected`, `rejected`, or `uncertain`. |
| `reviewerNote` | Human note field for Git review. |
| `sourceTextEntityIds` | Text entities that produced the semantic device. |

## Import

Viewer button:

```text
Import Semantic Review JSON
```

Import is schema-safe and validates against the current semantic extraction:

- `schema` must be `kairo-semantic-review-artifact`.
- `schemaVersion` must be `1`.
- `deviceId` values must exist in the current scene.
- `correctedGeometryGroupId` values must exist in the current scene.
- `corrected` rows must include a corrected type or corrected geometry group.
- `rejected` rows must set `unlink` to `true`.

Accepted and uncertain rows are preserved in the file but do not create active overrides when imported.

## Known Limitations

- Review artifacts are keyed by current semantic device IDs, so major extraction changes can make old artifacts fail import until reconciled.
- The viewer imports corrected/rejected decisions only; it does not yet persist reviewer notes into an on-screen note editor.
- This artifact is project-side review truth, not a trained classifier or AI model input pipeline yet.

## Next Recommended Slice

Use the semantic review artifact and reviewed Layout Library truth together to create the first checked-in P736/Scott training fixture:

- export the generated semantic review artifact from the real Scott/P736 scene
- review and correct high-value labels
- import it back into the viewer
- regenerate QA, Layout Library, training truth, and reviewed reusable library exports
