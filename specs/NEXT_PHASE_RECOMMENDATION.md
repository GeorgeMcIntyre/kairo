# Next Phase Recommendation

Last updated: 2026-05-14

---

## Current Position

ISSUE-001, ISSUE-002, ISSUE-003, granular batched picking, zoom-to-cursor, semantic validation, the semantic label-to-geometry device MVP, advanced layout exports, `.kairo` package file support, viewer diagnostics, and ISSUE-019 QA diagnostics are complete on the current integration branch. The Scott DXF2013 staged scene:

- Opens framing the facility with P95 robust bounds.
- Has 246,045 supported entities and 1,092 text labels.
- Uses 28 staged geometry documents and 160 layers; validation report is 0 errors / 0 warnings.
- Preserves Phase 10P batching: one `THREE.LineSegments` per geometry document.
- Resolves clicked line/polyline/circle/arc segments to exact DXF entity metadata in the properties panel.
- Supports mouse-wheel zoom toward cursor through `OrbitControls.zoomToCursor`.
- Keeps layer toggle, fit-scene, fit-main, fit-selected, text modes, and readable labels working.
- Extracts labels, classifies station/device/nest/dunnage-style labels with confidence and reasons, links labels to nearby block/geometry groups, and exposes linked/ambiguous/unlinked states.
- Provides session-only correction controls and JSON/Markdown semantic summary export.
- Supports local `.dxf` import and `.kairo` package open/drop. `.kairo` packages are ZIP-backed neutral scene packages created with `pack-scene`; `package-qa` can generate a redacted share package and compare package round-trip counts.
- Includes lightweight performance diagnostics for browser DXF load stages, importer parse/build stages, semantic analysis, viewport batch build, render setup, and first render in the existing Diagnostics panel.
- Caps broad semantic overlay lists while preserving selected items, and keeps loaded scenes drawing-first by collapsing Layers, Inspector, Semantics, and Diagnostics by default.
- Provides advanced layout JSON/CSV/Markdown export and a Scott semantic QA Markdown report.
- Has non-browser Scott semantic machine QA findings recorded as partial: all four required labels classify correctly, while `7B-070L-DN1` and `7B-070L-DN2` remain ambiguous geometry associations.
- Has targeted manual semantic QA PASS recorded by George for the required labels, including visual confirmation that DN1/DN2 correspond to the intended dunnage/rack geometry.
- Provides file-based semantic review JSON import/export for reviewed device snapshots, overrides, reviewer confirmations, required-label rows, and scene mismatch warnings.
- Provides a Scott layout content coverage pack at `specs/investigations/scott-layout-content-coverage/` with imported layer/entity counts, raw DXF block/text audit counts, label inventory, semantic item inventory, coverage risks, and reviewer columns for Scott feedback.
- Has Scott `.kairo` package machine QA recorded in `specs/investigations/SCOTT_KAIRO_PACKAGE_QA.md`: redacted package validates, counts match the staged scene, and local source paths are removed. Manual browser open/drop confirmation is still pending.
- Includes scoped drawing-first viewer polish: a compact drawing status strip, panel quick toggles, and automatic Inspector opening after geometry/semantic selection.
- Includes a clean large-DXF loading pass with workerized browser DXF import and semantic analysis plus a performance review artifact at `specs/investigations/SCOTT_VIEWER_PERFORMANCE_REVIEW.md`; browser Diagnostics timing capture remains the next performance validation step.
- Verification must be rerun after integration. The viewer build is expected to report the chunk-size warning only.

POC readiness: ~92% after targeted ISSUE-019 manual PASS and ISSUE-018 file-based review JSON persistence. Keep it below production readiness until review JSON workflow QA, `.kairo` package sharing QA, drawing-first UI polish, and deployment checks are complete.

---

## Warning Breakdown (Scott DXF2013, current)

| Warning code | Count |
|---|---:|
| DXF_BLOCK_PARTIAL_EXPAND | 160 |
| DXF_INSERT_Z_FLATTENED | 140 |
| DXF_INSERT_MIRROR_FLATTENED | 132 |
| DXF_POLYLINE_SPLINE_APPROXIMATED | 15 |
| DXF_BLOCK_INSERT_NESTED_UNSUPPORTED | 14 |
| DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED | 0 |

---

## Recommended Priority Order

### 1 - Scott layout content coverage review with Scott (P1, NOW)

Send or review the coverage pack with Scott. Capture which expected layout items are present, missing, misclassified, or need importer follow-up. Do not start DXF block-instance extraction until Scott identifies specific missing/wrong content.

### 2 - ISSUE-018: Review JSON workflow QA (P1, NOW)

Open the Scott staged scene, confirm the four required labels, set review status/notes, download `kairo-semantic-review.json`, refresh/reopen the scene, import the review JSON, and confirm overrides/reviewer fields restore without local paths or stale device warnings.

### 3 - ISSUE-020: `.kairo` package browser QA and sharing workflow (P1, NEXT)

Open `C:\tmp\kairo-scott-package-qa\scott-dxf2013-import-redacted.kairo` through the viewer on the shared test port and confirm it loads without staged public scene assets. Machine package QA has already passed.

### 4 - ISSUE-004: Drawing-first viewer UI browser review (P1, NEXT)

Review the scoped drawing-first implementation on the Scott staged scene and redacted `.kairo` package. Confirm the canvas-first default, compact status strip, quick panel toggles, and automatic Inspector opening are practical before broader UI redesign work.

### 5 - ISSUE-014: Text visual QA / alignment polish (P1, NEXT)

Manual CAD/browser QA is still needed for dense label areas. Fix only specific, proven placement/readability issues; otherwise record screenshots and keep importer/schema changes parked.

### 5A - Large-DXF browser performance timing capture (P1, NEXT)

Open the primary Scott DXF in the viewer and record the Diagnostics timings listed in `specs/investigations/SCOTT_VIEWER_PERFORMANCE_REVIEW.md`. Do not start a Web Worker refactor until those timings prove remaining main-thread blocking is unacceptable.

### 6 - ISSUE-015: Coordinate precision audit (P2, NEXT)

Audit world-space coordinate precision for the Scott DXF. Facility coordinates are at roughly 116k mm; with single-precision float in Three.js this may cause high-zoom jitter.

### 7 - ISSUE-016: Cloudflare deploy check (P1, NEXT)

Confirm Pages settings, local dist contents, `_redirects`, and staged scene payload. Use the CLI `stage-viewer-scene` command; there is no viewer `stage` script.

### 8 - ISSUE-017: CAD Exchanger GLB primitive probe (P2, NEXT - research only)

Research only. Do not implement an exporter. First prove CAD Exchanger behavior with a small GLB probe covering LINES, LINE_STRIP, TRIANGLES, TRIANGLE_STRIP, mesh ribbon fallback, material/layer preservation, and coordinate precision.

---

## Lower Priority Options

| Option | Status | Rationale |
|---|---|---|
| ISSUE-006: Layer controls / isolate workflow | LATER | Useful after drawing-first UI |
| ISSUE-010: Fast viewer QA workflow documentation | LATER | Useful after the next browser QA pass |
| ISSUE-007: Depth-3+ nested INSERT | LATER | Only 14 blocked instances |
| ISSUE-008: Complex POLYLINE policy | LATER | Current approximation is documented and stable |
| ISSUE-009: Performance baseline | LATER | Current load is acceptable; monitor as scene size grows |
| ISSUE-012: Claude skills | LATER | Useful for session consistency; not part of immediate product QA |
| ISSUE-013: JT export | PARKED | Raw JT 8.1 spike failed/unreadable; use CAD Exchanger only as a temporary bridge probe |

---

## What Done Looks Like After Priority 1-8

- Review JSON workflow is manually QA'd on the primary Scott layout.
- `.kairo` package machine QA has passed for the primary Scott layout; browser open/drop confirmation remains pending.
- Scott DXF semantic associations have a documented targeted manual QA pass.
- Reviewed semantic corrections can be saved and reloaded through review JSON.
- Canvas-dominant viewer layout with collapsible panels has a scoped implementation and needs browser review.
- Text visual QA notes are captured; any remaining alignment issues are labeled "needs manual QA."
- Coordinate precision has a written pass/fail recommendation.
- Cloudflare staging/deploy steps reference real commands.
- CAD Exchanger probe results identify which GLB primitives and metadata survive import.
- POC readiness remains around ~92% until review JSON workflow QA, package sharing, viewer polish, and deployment checks are resolved.
