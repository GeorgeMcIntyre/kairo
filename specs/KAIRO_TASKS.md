# Kairo Tasks

Last updated: 2026-05-09  
Use this file instead of GitHub Issues for now. Update section headers as tasks move.

---

## NOW

*(No active task — awaiting next phase assignment.)*

---

## DONE

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
