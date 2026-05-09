# Kairo Tasks

Last updated: 2026-05-09  
Use this file instead of GitHub Issues for now. Update section headers as tasks move.

---

## NOW

*(No active task — awaiting next phase assignment.)*

---

## DONE

### TASK-016: Phase 10O-A — Text/attribute/equipment audit ✅ DONE

**Completed:** 2026-05-10

Extended `inspect-dxf` with text audit. `output-base-path` is now optional — audit prints to stdout. New `DxfTextAuditSummary` type and `computeTextAudit()` in `analyzeDxfBlocks.ts`.

**Scott DXF2013 audit findings:**
- TEXT: 148 (all in block definitions, 0 direct)
- MTEXT: 0
- ATTDEF: 261 (all in block definitions, 0 direct)
- ATTRIB: 0

Equipment/robot block matches (5 blocks, all blocked by transform complexity):
- `Fanuc_Henrob Controller` — 18 inserts, FANUC pattern
- `W704949_de_...CONTROLLER_20250113` — 6 inserts, CONTROLLER pattern
- `70ZF-20013171_rbt_pwr_dist_400A` — 5 inserts, RBT pattern
- `FANUC_RBT_CNTR_R-J3iB` — 4 inserts, FANUC pattern
- `7B060 SPAC` — 2 inserts, SPAC pattern

Hard-transform blocks with text (20 blocks): top is `FENC-1525` (70 inserts, 3 ATTDEFs).

Partial-expand blocks where ATTDEF/TEXT was skipped (20 blocks): same top — `FENC-1525`, `*U36`, `BUCKET`, `*U48`, `FENC-1025`.

Richest text block: `Plant_Layout_A0-1189x841_v2014.01` — 114 TEXT + 16 ATTDEF (title block, 1 use).

Sample ATTDEF strings: fence panel descriptions, custom height labels, part codes.

Top text layer: `0` (403 text entities), then `FG-FENCE-TEXT` (2), `DES-AUTOMATION` (2).

101/101 tests pass. No viewer or importer changes.

---

### TASK-015: Phase 10N-B — Spline-fit POLYLINE expansion ✅ DONE

**Completed:** 2026-05-09

- `extractFittingVertices(entity)` filters VERTEX entities: flag & 8 (spline curve) and flag & 1 (curve-fit arc) — skips flag & 16 (frame control points).
- Spread-override pattern `{ ...entity, vertices: fittingVertices }` reuses existing `legacyPolylineToEntity` and `expandBlockLegacyPolyline` without new function signatures.
- `blockSkippableEntityTypes` and `blockSkippedEntityCounts` predicates updated: POLYLINEs with usable fitting vertices no longer counted as COMPLEX_POLYLINE.
- Three-path POLYLINE loop: simple chain → direct import; spline/curve-fit with fitting vertices → import + `DXF_POLYLINE_SPLINE_APPROXIMATED`; else → `DXF_POLYLINE_UNSUPPORTED`.
- Same pattern applied to depth-1 block expansion and depth-2 grandchild expansion loops.
- 7 new tests; 97/97 pass.
- Scott DXF2013: 142,378 → 142,393 entities; DXF_POLYLINE_UNSUPPORTED 15 → 0; DXF_POLYLINE_SPLINE_APPROXIMATED 0 → 15.

---

### TASK-014: Phase 10N-A — POLYLINE parser investigation ✅ DONE

**Completed:** 2026-05-10

**Findings:**
- `@dxfjs/parser` maps DXF group 70 to `VertexEntity.flag` (parser source: `VertexEntitySpec.set(70, "flag")`).
- Values 8 and 16 are preserved at runtime — confirmed by permanent diagnostic test.
- VERTEX `flag & 8` = spline vertex on the fitted curve (pre-sampled by AutoCAD) — safe to use as import chain.
- VERTEX `flag & 16` = spline frame control point — skip; not on the fitted curve.
- No B-spline math required for Phase 10N-B.

**Decision:** Phase 10N-B (spline-fit POLYLINE expansion) is viable. See ADR-010.

**Test added:** `"@dxfjs/parser exposes VERTEX flag (group 70) on spline-fit POLYLINE vertices"` — 90/90 pass.

---

### TASK-013: Phase 10P — Viewer performance for large DXF scenes ✅ DONE

**Completed:** 2026-05-09, commits ee7eb30 + 2fc3bdf

Stage 10P-1 (`perf: avoid full viewer rebuilds for large dxf scenes`):
- Split single `useEffect` (deps: `[fitRequest, hiddenLayerIds, onSelect, scenePackage, viewMode]`) into four independent effects.
- Build effect `[scenePackage, viewMode]`: full Three.js setup + GPU dispose on cleanup.
- Visibility effect `[hiddenLayerIds]`: toggles `object.visible` only.
- Fit effect `[fitRequest]`: repositions camera using cached bounds + refs.
- Selection effect `[selectedNodeId]`: updates material colors only.
- Latest-ref pattern for `hiddenLayerIds`, `selectedNodeId`, `onSelect` to avoid stale closures.

Stage 10P-2 (`perf: merge per-layer curve geometry to reduce draw calls`):
- Replaced one `Line2` per entity (~142,378 draw calls) with one `THREE.LineSegments` per geometry document (~24 draw calls).
- Removed `Line2`, `LineGeometry`, `LineMaterial` imports and `updateLineMaterialResolution`.
- Circle segments 64 → 32; arc segments 48 → 24.
- Bundle size 796 kB → 771 kB.

Result: Scott DXF2013 scene loads in ~5 s; layer toggle, fit, and selection are non-rebuilding.

---

### TASK-010: Phase 10K — Partial block expansion ✅ DONE

**Completed:** 2026-05-09
- Blocks with ATTDEF/TEXT/SPLINE/ELLIPSE expand supported geometry (LINE/LWPOLYLINE/CIRCLE/ARC).
- New warning code `DXF_BLOCK_PARTIAL_EXPAND`.
- Scott DXF2013: 13,711 → 30,442 supported entities.

---

### TASK-002: Human visual QA of Scott DXF2013 in viewer ✅

**Completed:** 2026-05-09. George confirmed viewer is usable: top-2D, fit, lines, layers all working.

---

### TASK-003: Phase 10I — Z-axis rotation tested INSERT regression ✅

**Completed:** 2026-05-09, commit 744d679  
- `packages/importer-dxf/test-fixtures/insert-rotation-basic.dxf`
- Inline tests: 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance, skip tests
- 70/70 tests pass

---

### TASK-006: Nested INSERT investigation (read-only audit) ✅

**Completed:** 2026-05-09 as part of Phase 10J missing geometry audit.  
See `specs/SCOTT_DXF_MISSING_GEOMETRY_AUDIT.md` for full findings.  
- 314 nested INSERTs inside block definitions
- 138 INSERT instances blocked by nested INSERT (22.9% of total)
- Top parent blocks: *U104 (9 inserts), *U133 (6), *U239 (5)
- Expansion deferred; partial block expansion (TASK-010) is higher priority

---

## NEXT

### TASK-011: Phase 10L — Z-offset INSERT expansion (2D projection) ✅ DONE

**Completed:** 2026-05-09, commit f40910b  
- `hardInsertTransformReason` replaces `unsupportedInsertTransformReason` (z-offset no longer a hard failure)
- `hasZOffset` helper; `expandInsert = {...entity, z: 0}` used for geometry expansion
- New warning code `DXF_INSERT_Z_FLATTENED` with original Z value in message
- 6 new inline tests + 1 updated test; 79/79 pass
- Scott DXF2013: 30,442 → 102,562 supported entities; 109 DXF_INSERT_Z_FLATTENED warnings

---

### TASK-012: Phase 10M — One-level nested INSERT expansion ✅ DONE

**Completed:** 2026-05-09, commit 6111938  
- `composeInserts()` computes world position + composed scale/rotation for child INSERT
- Nested expansion loop: cycle detection (`DXF_BLOCK_INSERT_CYCLE`), missing block, hard transform check, z-flattening, partial expand, depth guard (`DXF_BLOCK_INSERT_NESTED_UNSUPPORTED`)
- 10 new inline tests + 2 updated tests; 89/89 pass
- Scott DXF2013: 102,562 → 142,378 supported entities; DXF_BLOCK_INSERT_NESTED_UNSUPPORTED dropped 132 → 14

---

### TASK-004: CLI scene-stats command

**Goal:** Expose `computeSceneStats` from viewer as a CLI command for quick import QA.  
**Scope:** `packages/cli/src/index.ts` only; reuse existing `sceneStats.ts` logic.  
**Not allowed:** New schema fields; viewer changes.  
**Acceptance criteria:**
```
node packages/cli/dist/index.js scene-stats ".\tmp\scott-dxf2013-import"
```

---

## BLOCKED

### TASK-005: Fast automated viewer QA

**Blocked by:** No Playwright/Puppeteer setup; viewer requires real browser context for Three.js.

---

## DO NOT DO YET

- JT export (licensed Siemens toolkit required)
- GLB export (parked until DXF coverage is stable)
- DWG direct parsing (convert to DXF first)
- Non-uniform scale INSERT expansion
- Negative / mirror scale INSERT expansion
- Text / attribute geometry rendering
- SPLINE / ELLIPSE / complex POLYLINE approximation
- Full browser automation / backend / auth / cloud
- Major viewer redesign
