# Kairo Tasks

Last updated: 2026-05-09  
Use this file instead of GitHub Issues for now. Update section headers as tasks move.

---

## NOW

### TASK-001: Push Phase 10H to origin/main

**Goal:** Publish two committed but un-pushed viewer ergonomics commits.  
**Scope:** `git push origin main` only.  
**Not allowed:** Force push; amending history.  
**Acceptance criteria:** `git log --oneline origin/main -3` shows 5a7c008 at HEAD.  
**Verify:**
```
git push origin main
git log --oneline --decorate -3
```

---

### TASK-002: Human visual QA of Scott DXF2013 in viewer

**Goal:** George confirms the viewer is usable for inspecting the Scott DSP layout.  
**Scope:** Manual inspection only. No code changes during QA.  
**Not allowed:** Committing generated scene files; deploying.  
**Acceptance criteria:** All checklist items in `VIEWER_QA_WORKFLOW.md` signed off.  
**Verify:** See `specs/VIEWER_QA_WORKFLOW.md`.

---

## NEXT

### TASK-003: Phase 10I — Z-axis rotation tested INSERT regression

**Goal:** Confirm INSERT rotation support is correct with explicit tested DXF fixture.  
**Scope:** `packages/importer-dxf` tests only; no viewer changes.  
**Not allowed:** Nested INSERT expansion; non-uniform scale; negative/mirror scale.  
**Acceptance criteria:**
- New test fixture DXF with a rotated INSERT produces correct Kairo geometry.
- Existing 68 tests still pass.
- `pnpm typecheck` and `pnpm build` clean.  
**Verify:**
```
pnpm test
pnpm typecheck
pnpm build
```

---

### TASK-004: CLI scene-stats command

**Goal:** Expose `computeSceneStats` from viewer as a CLI command for quick import QA.  
**Scope:** `packages/cli/src/index.ts` only; reuse existing `sceneStats.ts` logic (already in viewer).  
**Not allowed:** New schema fields; viewer changes.  
**Acceptance criteria:**
```
node packages/cli/dist/index.js scene-stats ".\tmp\scott-dxf2013-import"
```
Prints: node count, layer count, geometry document count, curve entity count, mesh count, bounds, largest extent, empty geometry warnings.  
**Verify:**
```
pnpm test
pnpm typecheck
pnpm build
node packages/cli/dist/index.js scene-stats ".\tmp\scott-dxf2013-import"
```

---

## BLOCKED

### TASK-005: Fast automated viewer QA

**Goal:** Run headless viewer screenshot comparison without manual browser steps.  
**Blocked by:** No Playwright/Puppeteer setup; viewer runs client-side Three.js which needs a real browser context.  
**Unblock path:** After visual QA confirms the viewer is usable, decide whether headless QA ROI justifies setup cost.

---

## LATER

### TASK-006: Nested INSERT investigation (read-only audit)

**Goal:** Audit how many INSERTs in the Scott DXF are nested; classify expansion complexity.  
**Scope:** `inspect-dxf` output analysis and doc update only. No expansion code.  
**Not allowed:** Any INSERT expansion code changes.  
**Prerequisite:** TASK-003 rotation tests pass; human visual QA complete.

---

### TASK-007: Text / ATTDEF metadata strategy

**Goal:** Decide whether text entities should be: (a) metadata-only in import report, (b) source-map entry with no geometry, or (c) deferred to a later phase.  
**Scope:** Design doc update in `specs/` only. No importer code.  
**Not allowed:** Text geometry import without dedicated fixture and tests.

---

### TASK-008: Complex POLYLINE strategy

**Goal:** Decide approach for spline-fit, curve-fit, bulged, and 3D-mode POLYLINE variants.  
**Scope:** Design doc update only.  
**Not allowed:** Approximation geometry without explicit tests.

---

### TASK-009: Performance / batching for large scenes

**Goal:** Profile viewer render loop for large DXF import scene; decide batching strategy.  
**Scope:** Viewer profiling only. No schema changes.  
**Prerequisite:** Visual QA confirms scene is usable first.

---

## DO NOT DO YET

- JT export (licensed Siemens toolkit required)
- GLB export (parked until DXF coverage is stable)
- DWG direct parsing (convert to DXF first)
- Non-uniform scale INSERT expansion
- Negative / mirror scale INSERT expansion
- Nested INSERT expansion (before TASK-006 audit)
- Text / attribute geometry (before TASK-007 design decision)
- Full browser automation / backend / auth / cloud
- Major viewer redesign
