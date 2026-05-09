# Next Phase Recommendation

Last updated: 2026-05-09

---

## Current Position

Phase 10H (viewer ergonomics, fit, and line visibility) is committed and verified. All tests pass. The viewer has top-2D and perspective modes, fit-to-scene, fit-to-selection, and orbit controls. Human visual QA of the Scott DXF2013 scene has not yet been completed.

---

## Options Evaluated

### Option A — Continue viewer ergonomics

**Choose if:** Human cannot inspect the Scott layout comfortably after Phase 10H; fit, top-2D view, or line visibility is still poor.  
**Risk:** If viewer is now usable, additional ergonomics work before QA is premature.  
**Verdict:** Defer — assess in visual QA first.

---

### Option B — Phase 10I: INSERT rotation tested regression (RECOMMENDED)

**Choose if:** Viewer is usable and many symbols are visibly missing or incorrectly placed.  
**What this involves:**
- Write a minimal test fixture DXF containing a block with a rotated INSERT (e.g. 45°, 90°).
- Add importer tests that verify the rotated INSERT expands to the correct Kairo geometry coordinates.
- Confirm no regression in existing 68 tests.
- Scope: `packages/importer-dxf/src/` and `packages/importer-dxf/src/*.test.ts` only.  
**Risk:** Low. Code is already written (33d4830); this adds the missing safety net.  
**Verdict:** Do this immediately after visual QA confirms viewer is usable.

---

### Option C — Nested INSERT investigation

**Choose if:** Rotation is proven and the largest remaining visual gap is nested block references.  
**What this involves:** Read-only audit of `inspect-dxf` output; update design docs; no expansion code.  
**Risk:** Low for audit; medium for actual expansion (do audit first).  
**Verdict:** After Option B.

---

### Option D — Text / attribute metadata

**Choose if:** Labels are the most impactful missing element after basic geometry is confirmed.  
**What this involves:** Design decision only — no geometry code.  
**Risk:** Low for design; medium for geometry import.  
**Verdict:** Design decision can be made concurrently with Option B; geometry import is later.

---

### Option E — Performance optimization

**Choose if:** The viewer loads but feels unusably slow for the Scott layout.  
**What this involves:** Profile Three.js render loop; consider geometry batching or LOD.  
**Risk:** Medium — batching changes can affect correctness.  
**Verdict:** Defer until visual QA confirms the issue exists.

---

## Recommendation

**Immediate (before any code):**  
Complete TASK-002 (human visual QA via `VIEWER_QA_WORKFLOW.md`).

**If viewer is usable:**  
Proceed with Phase 10I (TASK-003) — write the INSERT rotation test fixture and verify correctness.

**If viewer is not usable:**  
Return to Option A — identify the specific ergonomics failure and fix it before any importer work.

**Default next coding prompt for George:**

> Phase 10I — Add a DXF test fixture containing a rotated INSERT block. Write importer tests that confirm the rotated INSERT expands to the correct Kairo curve geometry. All existing tests must continue to pass. Scope: packages/importer-dxf only. No viewer changes. No nested INSERT expansion.
