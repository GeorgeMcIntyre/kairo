# Nested INSERT Depth Audit

Date: 2026-06-06

## Scope

This is a planning audit for ISSUE-007. It does not change importer behavior.

The target is the remaining `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED` bucket recorded for the Scott DXF2013 import: 14 depth-3+ INSERT warnings. The current importer expands a top-level INSERT and one nested child INSERT. INSERTs found inside that child block are currently guarded and reported instead of expanded.

## Evidence Checked

- Staged scene: `apps/viewer/public/scenes/scott-dxf2013-import`
- Source DXF recorded in the staged manifest: `C:\Users\George\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf`
- Source DXF availability: present locally on 2026-06-06
- Staged manifest source note: imported with 461 warnings
- Staged validation report: 0 validator errors, 0 validator warnings
- Status warning bucket: `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED`: 14
- Importer guard location: `packages/importer-dxf/src/importerCore.ts`, in the nested INSERT expansion loop that emits `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED` for INSERTs found inside the already-expanded child block

The checked-in staged source map preserves expanded-entity provenance such as:

```text
Expanded from INSERT 177B0, BLOCK 70ZF-20013145, INSERT FF90, BLOCK 70ZF-20013145 OPER-CALL BOX.
```

That provenance is useful for expanded geometry, but it does not retain skipped depth-3 warning rows. Individual skipped handles therefore cannot be recovered from the staged scene alone.

## Inventory Notes

`inspect-dxf` was run against the source DXF and wrote:

```text
tmp/scott-dxf2013-insert-inventory.json
tmp/scott-dxf2013-insert-inventory.md
```

The block inventory topology is useful: parser OK, 602 INSERT entities, 214 unique INSERT block names, 286 block definitions, 0 missing block definitions, and 314 INSERTs inside block definitions.

However, that CLI run also reported obsolete transform-warning behavior that contradicts the current staged scene and status. Treat this output as block-definition topology only, not as current import warning truth.

The staged source-map two-level expansion paths currently mention these child block names:

| Child block | Expanded source rows | INSERTs in child definition |
|---|---:|---:|
| `*U189` | 30,864 | 0 |
| `*U34` | 2,352 | 0 |
| `RBRKT-2001_TopVIew` | 1,677 | 0 |
| `RBRKT-2004_TopView` | 903 | 0 |
| `70ZF-20013145 OPER-CALL BOX` | 228 | 0 |
| `*U55` | 112 | 0 |
| `MAP-B11-3X-19-P375-RFQ-01-2D$0$Light Curtian_2` | 84 | 0 |
| `*U53` | 24 | 0 |
| `*U210` | 3 | 0 |

This confirms a limitation of the checked-in artifacts: they show the expanded one-level paths, but not the 14 skipped depth-3 warning rows.

## Implementation Plan

Before any code change, recapture the exact 14 current `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED` warning rows with a known-good source runner. Record at minimum:

- top-level INSERT handle and block name
- child INSERT handle and child block name
- depth-3 INSERT handle and referenced block name
- child block entity counts
- whether the depth-3 target block is curve-only, mixed supported/unsupported, text-bearing, missing, or cyclic

Then implement depth-3 expansion as a small recursive refactor of the existing nested INSERT path:

1. Extract a helper that expands a block instance at a supplied composed transform and path.
2. Preserve current deterministic ordering by handle at every level.
3. Preserve current transform semantics: translation, Z rotation, uniform-magnitude negative scale/mirror handling, and Z flattening.
4. Preserve current partial-expansion behavior: supported curves, spline-fit POLYLINE fallback, TEXT, and ATTDEF expand; unsupported entity types still warn without blocking supported siblings.
5. Add explicit cycle detection using the block path, not a global visited set.
6. Add a configurable internal depth guard, initially allowing depth 3 only.
7. Emit a richer warning when the new guard is hit, including the full INSERT/BLOCK path.
8. Extend source-map notes to include the full nested path for depth-3 expansions.

Do not change the neutral scene schema for this work. Depth-3 expansion should still produce the existing curve/text entity shapes and existing source-map structure.

## Tests Required

Add focused importer tests before touching the Scott fixture:

- depth-3 LINE expansion with identity transforms
- depth-3 transform composition with parent rotation plus child translation
- depth-3 mirrored uniform scale using the existing mirror semantics
- depth-3 Z-offset flattening warning behavior
- depth-3 TEXT/ATTDEF expansion
- depth-3 unsupported entity partial expansion
- cycle detection where a depth-3 block references an ancestor block
- max-depth guard still emits one deterministic warning when depth exceeds the new limit
- source-map note includes the full nested path

After unit tests pass, run the primary Scott DXF import and compare:

- `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED` should drop from 14 to 0, or every remaining row must be explained by cycle/missing/unsupported-depth policy.
- Existing known warning buckets should not regress.
- Scene validation remains 0 errors / 0 warnings.
- Entity count increases only by the expected depth-3 expansions.
- Viewer load/performance remains within the current review workflow envelope.

## Risks

- Anonymous `*U...` blocks are heavily reused, so one block-definition change can multiply entities across many placements.
- Full recursion without a narrow depth guard could produce large entity-count jumps or repeated geometry in cyclic block graphs.
- Source-map IDs and notes are deterministic today; recursive path notes must stay deterministic for fixture stability.
- Text-bearing nested blocks can improve review usefulness but may also increase overlay density.
- Some child blocks contain unsupported types such as POINT, SPLINE, or ELLIPSE; the implementation must preserve partial expansion instead of making these blocks all-or-nothing.

## Stop Rule

This audit closes the planning task only. Do not implement depth-3 expansion without explicit approval and a fresh capture of the exact 14 current warning rows.
