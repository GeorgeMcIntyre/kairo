# Kairo Tasks

Last updated: 2026-05-09  
Use this file instead of GitHub Issues for now. Update section headers as tasks move.

---

## NOW

### TASK-010: Phase 10K — Partial block expansion ← IN PROGRESS

**Goal:** Change the importer so that blocks containing unsupported entity types (ATTDEF, TEXT, SPLINE, ELLIPSE, POINT, COMPLEX_POLYLINE) no longer cause the entire INSERT to be skipped. Expand supported curve entities (LINE, LWPOLYLINE, CIRCLE, ARC, simple POLYLINE) from the block; emit per-block warnings for skipped entity types and counts; continue to fully skip blocks containing nested INSERTs.  
**Scope:** `packages/importer-dxf/src/index.ts` only; no viewer changes.  
**Not allowed:** TEXT/ATTDEF geometry rendering; SPLINE/ELLIPSE approximation; nested INSERT expansion; viewer changes.  
**Expected impact:** Scott DXF2013 supported entity count increases by several thousand (FENC fence panels, equipment blocks recovered). DXF_BLOCK_UNSUPPORTED_CONTENT warnings drop to near zero; new DXF_BLOCK_PARTIAL_EXPAND warnings appear.  
**Acceptance criteria:**
- New warning code `DXF_BLOCK_PARTIAL_EXPAND` emitted with entity type + count details.
- Test: block with ATTDEF+LINE → LINE expanded, ATTDEF warning.
- Test: block with TEXT+LWPOLYLINE → LWPOLYLINE expanded, TEXT warning.
- Test: block with SPLINE+CIRCLE → CIRCLE expanded, SPLINE warning.
- Test: block with only TEXT → no geometry, warning only.
- All 70 existing tests pass.
- Scott DXF2013 import passes. Validate passes.  
**Commit message:** `feat: expand supported geometry from mixed dxf blocks`

---

### TASK-001: Push all unpushed commits to origin/main ← PENDING

**Goal:** Push `744d679` (rotation tests) plus the docs commit from this phase to origin/main.  
**Scope:** `git push origin main` after audit docs commit.

---

## DONE

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

### TASK-011: Phase 10L — Z-offset INSERT expansion (2D projection)

**Goal:** Allow INSERTs with z ≠ 0 (but otherwise valid transform) to expand by projecting geometry to z=0 for 2D layout inspection.  
**Prerequisite:** TASK-010 complete and Scott re-imported with visual QA.  
**Not allowed:** Non-uniform scale; negative scale.  
**Expected impact:** ~109 additional INSERT instances expanded.

---

### TASK-012: Phase 10M — One-level nested INSERT expansion

**Goal:** Allow blocks containing child INSERTs to expand supported geometry from the child block (one level deep only).  
**Prerequisite:** TASK-010 + TASK-011 complete; new fixture suite.  
**Not allowed:** Recursive nesting beyond one level; transform complexity changes.  
**Expected impact:** ~138 additional INSERT instances expanded.

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
