# Kairo Status

Last updated: 2026-05-10

## Git

- Branch: main
- HEAD: 1e713df feat: ISSUE-003 text alignment — wire DXF group 72/73/71 through to viewer anchor
- In sync with origin/main (post-push)

## Verification (as of HEAD)

| Check | Result |
|---|---|
| `pnpm test` | 201/201 passed |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean (viewer bundle ~780 kB — chunk size warning only) |
| `import-dxf` Scott DXF2013 | Passed — 246,045 supported, 461 warnings |
| `validate` | Passed — 0 errors, 0 warnings |
| `stage-viewer-scene` | Passed — staged to `scott-dxf2013-import` |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `inspect-dxf`, `stage-viewer-scene`, `scene-outliers`.
- DXF import: LINE, LWPOLYLINE, CIRCLE, ARC, LAYER, simple POLYLINE vertex chains, TEXT, ATTDEF (default value or tag fallback), MTEXT (via direct ENTITIES-section scanner).
- DXF pre-clean: removes scoped ACAD_REACTORS groups; appends missing EOF.
- INSERT expansion: up to two levels deep (parent + one nested child), curve-only blocks, uniform scale (positive or negative mirror), Z-axis rotation, z-offset flattening.
- INSERT rotation: verified by dedicated DXF file fixture and inline tests for 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance.
- INSERT mirror expansion (Phase 10S): INSERTs with uniform-magnitude negative scale (e.g. xScale=-25.4, yScale=25.4, zScale=25.4) expand with per-axis scale and arc angle reflection. DXF_INSERT_MIRROR_FLATTENED warning emitted.
- TEXT/ATTDEF rendering (Phase 10T-B): Schema has `text` entity type. Importer extracts direct TEXT entities and TEXT/ATTDEF inside block expansions (depth-1 and depth-2) with INSERT position transform. Viewer renders text as HTML overlay above the Three.js canvas; font size clamped 5–48px; layer-toggle and rAF-driven projection.
- MTEXT extraction (Phase 10T-C): Direct ENTITIES-section MTEXT scanner (`extractMtext.ts`) extracts MTEXT records that `@dxfjs/parser` does not surface. Full DXF formatting-code stripping (`\P`, `\X`, `\~`, `\C`, `\H`, `\f`, `\U+XXXX`, stacked text, grouping braces). Scott DXF2013 had 343 MTEXT records silently dropped before this commit; large station headers like "7B-070L RACK LOAD" at 457.2 mm are now visible.
- Text alignment (ISSUE-003): Schema `textEntitySchema` gains optional `hAlign`, `vAlign`, `alignmentPoint`, `attachmentPoint`. Importer reads DXF group 72 (`horizontalJustification`), group 73 (`verticalJustification`), and group 11/21/31 (second alignment point); uses second point as `position` when hAlign≠0 or vAlign≠0. MTEXT `attachmentPoint` (group 71, 1–9) wired from scanner through to entity. Viewer `textAnchorPercent()` and `mtextAnchorPercent()` compute CSS `transform-origin` per label so projected screen point is the correct DXF logical anchor. Scott DXF2013: 477 TEXT/ATTDEF with non-default hAlign, 467 with non-default vAlign, 123 MTEXT with attachmentPoint.
- Label density modes (Phase 10T-C): Auto / All / Off. Auto uses 90th-percentile world-height threshold — large headers stay visible at fit-scene while small annotations declutter. All clamps tiny labels to 2px minimum. Off hides all text.
- Readable orientation toggle (Phase 10T-C): Flips upside-down labels (rotation mod 360 in 90°–270°) to read left-to-right.
- INSERT partial expansion (Phase 10K): Blocks with ATTDEF/TEXT/SPLINE/ELLIPSE expand supported geometry (LINE/LWPOLYLINE/CIRCLE/ARC).
- INSERT z-offset flattening (Phase 10L): INSERTs with non-zero Z position expanded with z=0 and DXF_INSERT_Z_FLATTENED warning.
- One-level nested INSERT expansion (Phase 10M): parent blocks containing child INSERTs expand grandchild geometry via composed transform. Depth guard for depth-3+. Cycle detection.
- Spline-fit POLYLINE expansion (Phase 10N-B): spline-fit and curve-fit POLYLINEs expanded using pre-sampled fitting vertices from the DXF file. Emits DXF_POLYLINE_SPLINE_APPROXIMATED.
- Viewer performance (Phase 10P): scene loads in ~5 s; layer toggle, fit, and selection are non-rebuilding (~24 draw calls, one LineSegments per geometry document).
- Viewer: top-2D and perspective modes, fit-to-scene, fit-to-selection, orbit controls, tree selection, source-map display, layer list, diagnostics panel, text density controls.
- Scene outliers: `scene-outliers` CLI command lists entities >3× median distance from scene centroid.
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## Visual QA State (as of 2026-05-10)

**Usable but not polished.** The Scott DXF2013 layout loads, lines are visible, layers toggle, and text/MTEXT labels including large station headers appear.

Known visual issues still requiring work:
- Text anchor position is now correct per-entity but visual overlap/density may still need tuning in dense label areas
- Clicking a line resolves to the batched LineSegments object (node-level), not the individual DXF entity within the batch — granular picking is the next inspection improvement
- Viewer UI is development-oriented; for drawing-first review, panels take too much screen space
- Mouse wheel zoom is center-of-viewport, not toward cursor

## What Is Broken / Missing

- 14 INSERT instances still blocked by depth-3+ nested INSERTs (depth guard limit).
- ATTRIB (attribute overrides): not imported; ATTDEF default value used instead.
- MTEXT inside block definitions: not expanded during INSERT expansion (only direct ENTITIES-section MTEXT is imported via scanner).
- Mirror-aware text rotation: text rotation does NOT reflect under mirrored INSERT (AutoCAD MIRRTEXT=0 default semantics). Position is mirror-correct. Acceptable v1 limitation.
- Granular entity picking: raycaster resolves to the batched LineSegments node, not the individual DXF entity within the batch. Per-entity picking requires a segment-index → entity map (planned).
- Text overlay does not collision-detect or z-order against curves.
- Hatches, dimensions, splines are not imported.
- DXF export, GLB export, JT export: not implemented.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Recommended Next Phase

See `specs/NEXT_PHASE_RECOMMENDATION.md`. Priority order:
1. **Granular entity picking** — segment-index → entity map so raycast resolves to exact DXF entity, not just the LineSegments node
2. **ISSUE-005** — Mouse wheel zoom toward cursor (controls.zoomToCursor)
3. **ISSUE-004** — Drawing-first viewer UI (maximize canvas, toolbar)
4. Coordinate precision audit
5. Export/JT probe (not exporter — research only)

## Phase 10R-A: Transform Complexity Audit Findings (Scott DXF2013)

| Metric | Value |
|---|---|
| Hard-blocked top-level INSERTs | 108 |
| Category: pureNegativeUniform | 108 (100%) |
| Category: pureNonUniformPositive | 0 |
| Negative X axis | 108 |
| Negative determinant | 108 |
| Has rotation also | 66 |
| Z offset also (handled by Phase 10L) | 30 |

## Known Import Warning Buckets (Scott DXF2013 — after Phase 10T-C)

| Warning code | Count | Notes |
|---|---|---|
| DXF_BLOCK_PARTIAL_EXPAND | 160 | Blocks with mixed supported/unsupported entity types |
| DXF_INSERT_Z_FLATTENED | 140 | Z-offset INSERTs expanded with z=0 |
| DXF_INSERT_MIRROR_FLATTENED | 132 | Uniform-magnitude negative-scale INSERTs |
| DXF_POLYLINE_SPLINE_APPROXIMATED | 15 | Spline-fit POLYLINEs via pre-sampled fitting vertices |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 14 | Depth-3+ inserts hit depth guard |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 0 | All resolved by Phase 10S |

## Scott DXF2013 Entity Progression

| Phase | Supported entities | Key change |
|---|---|---|
| Before Phase 10K | 13,711 | Only clean curve-only blocks expanded |
| After Phase 10K | 30,442 | Partial expansion: mixed blocks expand supported geometry |
| After Phase 10L | 102,562 | Z-offset INSERTs expanded |
| After Phase 10M | 142,378 | One-level nested INSERT expansion via composed transform |
| After Phase 10N-B | 142,393 | Spline-fit POLYLINEs (+15 entities) |
| After Phase 10S | 244,953 | Mirror INSERT expansion (+102,560 entities) |
| After Phase 10T-B | 245,922 | TEXT + ATTDEF (+969 entities; rendered as HTML overlay) |
| After Phase 10T-C | 246,045 | MTEXT scanner (+123 entities; station headers now visible) |
| After ISSUE-003 | 246,045 | Text alignment fields wired; entity count unchanged; anchors corrected |

## Viewer Performance Baseline (after Phase 10P)

Scott DXF2013: ~246k curve entities across ~24 geometry documents.

| Metric | Value |
|---|---|
| Scene load time | ~5 seconds (JSON fetch + parse + Float32Array assembly) |
| Draw calls | ~24 (one `THREE.LineSegments` per geometry document) |
| Layer toggle | No rebuild — toggles `object.visible` only |
| Fit scene / fit selected | No rebuild — repositions camera using cached bounds |
| Selection highlight | No rebuild — updates material color only |

### Performance Invariants — Do Not Violate

- No one Three.js object per curve entity.
- No one material per curve entity.
- No full scene rebuild on layer toggle, fit, or selection.
- If entity count grows significantly, check JSON/loading performance before committing.

## Latest DXF Files Tested

- `DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf` — primary test file
- Viewer scene name: `scott-dxf2013-import`
- Viewer URL: `http://localhost:5173/?scene=scott-dxf2013-import`
