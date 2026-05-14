# Kairo Status

Last updated: 2026-05-14

## Git

- Branch: `codex/kairo-viewer-semantics-integrated`
- HEAD before package/ISSUE-019 integration: `b34d5ad feat: add advanced layout exports`
- Current checkpoint includes `.kairo` package support, viewer diagnostics, ISSUE-019 semantic QA diagnostics, a non-browser Scott semantic machine QA pass with partial association findings, targeted manual semantic QA PASS, and ISSUE-018 review JSON persistence work.
- Pre-existing local/untracked deploy/demo files remain present and were not cleaned up: `.claude/`, `gem.ps1`, `tmp/`, `tools/`, `wrangler.toml`, and several deploy/demo spec files.

## Verification (current branch)

| Check | Result |
|---|---|
| `pnpm.cmd test -- --minWorkers=1 --maxWorkers=1` | 287/287 passed |
| `pnpm.cmd typecheck` | Clean |
| `pnpm.cmd build` | Clean (viewer bundle ~879 kB, chunk size warning only) |
| `node packages\cli\dist\index.js validate apps\viewer\public\scenes\scott-dxf2013-import` | Passed, 0 errors / 0 warnings |
| Scott DXF2013 staged scene | Loads from `apps/viewer/public/scenes/scott-dxf2013-import` |
| `pnpm.cmd test apps/viewer/src/semantic/scottSemanticQa.integration.test.ts -- --minWorkers=1 --maxWorkers=1` | Passed; Machine QA partial |
| Targeted manual semantic QA | PASS; see `specs/investigations/SCOTT_SEMANTIC_QA_MANUAL_FINDINGS.md` |

## Current Staged Scott Scene

Source: `apps/viewer/public/scenes/scott-dxf2013-import`

| Metric | Value |
|---|---:|
| Geometry documents | 28 |
| Curve entities | 244,953 |
| Text labels | 1,092 |
| Total curve/text entities | 246,045 |
| Scene nodes | 29 |
| Layers | 160 |
| Source-map rows | 246,046 |
| Validation report | 0 errors / 0 warnings |

## What Works

- Full monorepo build: schema, validator, core, importer-dxf, CLI, viewer.
- CLI commands: `validate`, `import-dxf`, `pack-scene`, `inspect-dxf`, `stage-viewer-scene`, `scene-outliers`.
- `.kairo` package format: standard deflated ZIP container with custom extension. `pack-scene` writes packages, `validate` reads packages, and the viewer opens `.kairo` files through the same local file picker/drop path as raw DXF.
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
- Viewer performance (Phase 10P): scene loads in ~5 s; layer toggle, fit, and selection are non-rebuilding (~28 draw calls, one LineSegments per geometry document).
- Viewer inspection: top-2D and perspective modes, fit-to-scene, fit-main, fit-to-selection, orbit controls, mouse-wheel zoom toward cursor, tree selection, exact entity picking inside batched LineSegments, source-map display, layer list, diagnostics panel, text density controls.
- Semantic classification MVP: extracted text labels are classified as station, robot/device, nest, dunnage, known support equipment, or unknown with confidence and evidence. Code/tests protect these Scott label rules: `7B-020L-04` is a robot/device number, not a station; `7B-070L-DN1` and `7B-070L-DN2` are dunnage stations; `7B-060L-1N` is a nest.
- Semantic device association MVP: labels are linked to nearby geometry groups using block-insert provenance first and fallback geometry clusters second. Each semantic device records linked entity IDs, label entity IDs, bounds, centroid, association status (`linked`, `ambiguous`, `unlinked`), association confidence, candidates, and reason strings. These links are automated candidate evidence; visual usefulness still requires ISSUE-019 manual review.
- Viewer semantic workflow: semantic overlays show station/device outlines, label markers, and label-to-geometry link lines. Selecting a label/device shows class, confidence, evidence, association candidates, linked entity IDs, and bounds. Selecting linked geometry shows the assigned semantic device.
- Viewer performance diagnostics follow-up: DXF browser loads now carry lightweight stage timings for file read, importer module load, parse/import stages, semantic analysis, viewport batch build, render setup, and first render. Timings are shown only in the collapsed Diagnostics panel.
- Viewer semantic performance follow-up: semantic analysis is deferred after scene activation so geometry can become visible before the semantic pass completes. Semantic overlay rendering is capped for broad station/device/unknown lists while preserving the selected item.
- Drawing-first panel controls: Layers, Semantics, and Inspector panels can be hidden independently from the toolbar and from each panel header without changing layer visibility, selection, or semantic overlay state. Local DXF opens with Layers/Inspector visible and Semantics collapsed by default.
- Text readability follow-up: dense drawing labels and semantic overlay labels are capped more aggressively with a stronger dark halo so long yellow labels remain readable without taking over the canvas.
- Manual correction MVP: selected semantic devices can be session-overridden for class and geometry association, or manually unlinked. Overrides are applied to the visible summary/export without mutating the detected baseline.
- Semantic summary/export MVP: viewer summary counts stations, devices, linked/ambiguous/unlinked devices, unknown labels, and low-confidence devices. JSON and Markdown exports are available through copy/download actions.
- Advanced layout exports: viewer can export a concept-quote oriented model as JSON, CSV, or Markdown with lines, stations, devices, annotations, warnings, review items, and summary counts.
- ISSUE-019 semantic QA support: viewer can download `scott-semantic-qa-report.md`, a deterministic Markdown review report covering required Scott labels, association status/confidence, candidate groups, risk markers, reviewer columns, and known limits. Non-browser machine QA found and correctly classified all four required labels, but `7B-070L-DN1` and `7B-070L-DN2` are ambiguous geometry associations. George completed targeted manual visual QA and confirmed DN1/DN2 visually match the intended dunnage/rack geometry. ISSUE-019 is DONE for the required labels.
- ISSUE-018 semantic review persistence: viewer can export/import a separate `kairo-semantic-review.json` file containing a full effective semantic device snapshot, existing override map, reviewer confirmations/notes, required-label rows, scene fingerprint, and stale/mismatch warnings. This does not change the staged scene format or `.kairo` package format.
- Cloudflare Pages deploy config: static SPA build uses `pnpm --filter @kairo/viewer build`, output directory `apps/viewer/dist`, repo-root `_redirects` exists, and scene assets are staged under the viewer public scene path.
- Scene outliers: `scene-outliers` CLI command lists entities >3× median distance from scene centroid.
- Validated DXF files: DXF2013, DXF2010, DXFR12LT2 (Scott layout files).

## Visual QA State (as of 2026-05-10)

**Usable but not polished.** The Scott DXF2013 layout loads, lines are visible, layers toggle, and text/MTEXT labels including large station headers appear.

Known visual issues still requiring work:
- Text anchor position is now correct per-entity but visual overlap/density may still need tuning in dense label areas
- Viewer UI is development-oriented; panels are now hideable, but the next step is a cleaner drawing-first layout mode
- Browser console still reports duplicate React keys in the text overlay for some expanded labels; this needs follow-up QA/fix and is separate from the picking/zoom work.

## What Is Broken / Missing

- 14 INSERT instances still blocked by depth-3+ nested INSERTs (depth guard limit).
- ATTRIB (attribute overrides): not imported; ATTDEF default value used instead.
- MTEXT inside block definitions: not expanded during INSERT expansion (only direct ENTITIES-section MTEXT is imported via scanner).
- Mirror-aware text rotation: text rotation does NOT reflect under mirrored INSERT (AutoCAD MIRRTEXT=0 default semantics). Position is mirror-correct. Acceptable v1 limitation.
- Text overlay does not collision-detect or z-order against curves.
- Direct raw DXF browser upload and `.kairo` package upload are implemented; staged public scenes are still useful for fixed demos.
- Semantic device association is an assistive proximity/provenance heuristic, not authoritative CAD assembly ownership.
- ISSUE-019 manual visual QA is captured as a targeted PASS for the required labels. Machine QA partial results remain recorded in `specs/investigations/SCOTT_SEMANTIC_QA_MACHINE_FINDINGS.md`.
- Review JSON persistence exists in the viewer, but it is a file-based v1 workflow rather than backend/browser autosave or `.kairo` embedding.
- Hatches, dimensions, splines are not imported.
- DXF export, GLB export, JT export: not implemented as production features. Raw JT 8.1 spike is documented as unreadable; CAD Exchanger is the temporary JT bridge direction only.
- No CI pipeline; tests run locally only.
- No automated visual regression.

## Recommended Next Phase

See `specs/NEXT_PHASE_RECOMMENDATION.md`. Priority order:
1. QA the ISSUE-018 review JSON import/export workflow on the Scott staged scene.
2. **ISSUE-020** - `.kairo` package QA and sharing workflow.
3. **ISSUE-004** - Drawing-first viewer UI (maximize canvas, toolbar)
4. Text visual QA / alignment polish
5. Coordinate precision audit
6. Cloudflare deploy check

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

Scott DXF2013: ~246k curve entities across 28 geometry documents.

| Metric | Value |
|---|---|
| Scene load time | ~5 seconds (JSON fetch + parse + Float32Array assembly) |
| Draw calls | ~28 (one `THREE.LineSegments` per geometry document) |
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
