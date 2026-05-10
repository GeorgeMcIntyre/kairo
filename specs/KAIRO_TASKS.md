# Kairo Tasks

Last updated: 2026-05-10
Use this file instead of GitHub Issues for now (ChatGPT connector issue creation blocked). Update section headers as tasks move. See also `specs/ISSUE_BACKLOG.md` for full issue details.

---

## NOW

### ISSUE-001: Scott DXF outlier / floater audit (P0)

**Goal:** Classify all 5,506 outlier entities (>3× median distance) in the Scott DXF2013 scene into categories: correct far-field equipment, transform bug, or reference geometry. Phase 10T-A confirmed top-6 are mathematically correct; the full set is unclassified.

**Allowed:** Use/improve `scene-outliers` CLI. Create `specs/SCOTT_DXF_OUTLIER_AUDIT.md`. Add layer/block/entity-type to output if small change.

**Not allowed:** Delete geometry, hide outliers automatically, change importer transforms without proven root cause, touch GLB/JT/export.

**Acceptance:**
- Top outliers classified by category
- Likely cause and recommended fix path documented
- `pnpm test` / `pnpm typecheck` / `pnpm build` pass

---

### ISSUE-011: Repo workflow / GitHub issue fallback (P1)

**Goal:** Keep planning reliable while ChatGPT issue creation is blocked. `specs/ISSUE_BACKLOG.md` is the source of truth.

**Status:** This issue is fulfilled by this file and `ISSUE_BACKLOG.md` existing. Mark DONE when docs are committed and pushed.

---

## NEXT

### ISSUE-002: Selection and inspection usability (P0)

**Goal:** Click visible entity → see layer/type/handle/source chain → fit selected. George needs practical review flow.

**Allowed:** Improve picking tolerance, hover highlight, selection panel details, fit-selected, isolate-by-layer.

**Not allowed:** Redesign viewer, change importer, touch GLB/JT/export.

**Verification:** Manual QA at `http://localhost:5173/?scene=scott-dxf2013-import`

---

### ISSUE-003: Text placement and alignment correctness (P0)

**Goal:** Improve TEXT/MTEXT placement accuracy — horizontal alignment (group 72), vertical alignment (group 73), MTEXT attachment point (group 71).

**Allowed:** Schema-safe fields only if proven needed, overlay placement tests.

**Not allowed:** Full rich MTEXT formatting, viewer redesign, break existing display, touch GLB/JT/export.

---

### ISSUE-004: Viewer UI drawing-first review mode (P1)

**Goal:** Maximize canvas space by default. Toolbar: Fit / Top2D / 3D / Fit-selected / Layers / Text / Diagnostics. Layers as main side panel. Diagnostics collapsed.

**Not allowed:** Touch importer/schema/GLB/JT/export. Remove sample scene support.

---

### ISSUE-005: Mouse wheel zoom toward cursor (P1)

**Goal:** `controls.zoomToCursor = true` if OrbitControls supports it. Test orthographic and top-2D views. If not supported, report smallest safe custom approach without implementing it.

**Not allowed:** Touch importer/schema/GLB/export.

---

### ISSUE-006: Layer controls and isolate workflow (P1)

**Goal:** Layer search/filter, isolate layer, show all, hide all except selected, counts visible.

**Not allowed:** Change importer, redesign full viewer.

---

### ISSUE-010: Fast viewer QA workflow documentation (P1)

**Goal:** Update `specs/VIEWER_QA_WORKFLOW.md` to include text/MTEXT checklist items, density modes, expected warning counts, and current entity counts.

---

### ISSUE-012: Claude skills for Kairo (P2)

**Goal:** Create `.claude/skills/kairo-*.md` skill files with allowed/not-allowed rules for each area (main workflow, viewer UI, DXF importer, planning).

---

## LATER

### ISSUE-007: Nested INSERT investigation (P2)

**Goal:** Audit and plan safe depth-3 expansion for the 14 remaining depth-guard-blocked INSERTs. Plan only — do not implement without approval.

---

### ISSUE-008: Complex POLYLINE / spline-fit policy (P2)

**Goal:** Document policy for remaining complex POLYLINE variants (3D mesh, polyface, etc.) not covered by Phase 10N-B.

---

### ISSUE-009: Render performance / batching baseline (P2)

**Goal:** Document performance baseline at current entity counts. Identify next bottleneck if entity count grows.

---

### ISSUE-013: JT export future roadmap (P3 — PARKED)

**Goal:** Keep parked. No work until DXF coverage and viewer are stable. Requires Siemens JT Open Toolkit.

---

## BLOCKED

### TASK-005: Fast automated viewer QA

**Blocked by:** No Playwright/Puppeteer setup. Viewer requires real browser context for Three.js. No plan to unblock in current phase.

---

## DONE

### TASK-019: Phase 10T-C — MTEXT extraction and label density improvements ✅ DONE

**Completed:** 2026-05-10 (commits 703725b, c1241f1)

MTEXT scanner added (`extractMtext.ts`) — `@dxfjs/parser` does not surface MTEXT, so a direct ENTITIES-section text scanner was written. Strips DXF formatting codes (`\P`, `\X`, `\~`, `\C`, `\H`, `\f`, `\U+XXXX`, stacked text, grouping braces). Scott DXF2013 had 343 MTEXT records silently dropped before this; large station headers like "7B-070L RACK LOAD" at 457.2 mm are now visible.

Label density modes added: Auto / All / Off. Auto uses 90th-percentile world-height threshold so large headers stay visible at fit-scene even when small annotations would be hidden. Readable toggle flips upside-down labels (rotation mod 360 in 90–270°) left-to-right.

Scott DXF2013: 969 text entities → 1092 (+123 MTEXT). 151/151 tests pass.

---

### TASK-019: Phase 10T-B — TEXT/ATTDEF rendering ✅ DONE

**Completed:** 2026-05-10

Schema gained `text` entity type. Importer extracts direct TEXT entities and TEXT/ATTDEF inside block expansion (depth-1 and depth-2). Viewer renders text as `<SceneTextOverlay>` HTML overlay — no TextGeometry. Font size clamped 5–48 px. Layer toggle hides matching text. Camera changes drive rAF projection.

Scott DXF2013: 244,953 → 245,922 entities (+969 = 230 TEXT + 739 ATTDEF). DXF_BLOCK_PARTIAL_EXPAND: 550 → 160. 133/133 pass.

---

### TASK-018: Phase 10T-A — Visual QA spike (scene-outliers CLI) ✅ DONE

**Completed:** 2026-05-10. Added `scene-outliers` CLI command. Found 5,506 outliers (~2.25%); top 30 analyzed; top-6 verified as mathematically correct (block-local coordinates at ±440k mm, INSERT rotation + position produce ±800k). No transform bug.

---

### TASK-017: Phase 10S — Uniform-magnitude mirror INSERT expansion ✅ DONE

**Completed:** 2026-05-10. All INSERTs with uniform-magnitude negative scale now expand with per-axis scale and arc angle reflection. `DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED`: 130 → 0. Supported entities: 142,393 → 244,953.

---

### TASK-017-PREP: Phase 10R-A — Transform complexity audit ✅ DONE

**Completed:** 2026-05-10. All 108 top-level hard-blocked INSERTs were pureNegativeUniform. Option A unlocks all 108.

---

### TASK-016: Phase 10O-A — Text/attribute/equipment audit ✅ DONE

**Completed:** 2026-05-10. TEXT: 148, MTEXT: 0, ATTDEF: 261 in Scott DXF2013. Richest text block: `Plant_Layout_A0-1189x841_v2014.01` (114 TEXT + 16 ATTDEF).

---

### TASK-015: Phase 10N-B — Spline-fit POLYLINE expansion ✅ DONE

**Completed:** 2026-05-09. `DXF_POLYLINE_UNSUPPORTED`: 15 → 0. +15 `DXF_POLYLINE_SPLINE_APPROXIMATED`.

---

### TASK-014: Phase 10N-A — POLYLINE parser investigation ✅ DONE

**Completed:** 2026-05-10. VERTEX flag & 8 = spline curve vertex (safe to use). flag & 16 = control point (skip).

---

### TASK-013: Phase 10P — Viewer performance for large DXF scenes ✅ DONE

**Completed:** 2026-05-09. Split useEffect into 4 independent effects. Replaced per-entity Line2 with per-document LineSegments (~24 draw calls). Scott scene: ~5 s load time.

---

### TASK-012: Phase 10M — One-level nested INSERT expansion ✅ DONE

**Completed:** 2026-05-09. `composeInserts()`. Supported entities: 102,562 → 142,378. `DXF_BLOCK_INSERT_NESTED_UNSUPPORTED`: 132 → 14.

---

### TASK-011: Phase 10L — Z-offset INSERT expansion ✅ DONE

**Completed:** 2026-05-09. Z-offset INSERTs expanded with z=0. `DXF_INSERT_Z_FLATTENED`. Entities: 30,442 → 102,562.

---

### TASK-010: Phase 10K — Partial block expansion ✅ DONE

**Completed:** 2026-05-09. Entities: 13,711 → 30,442.

---

### TASK-002: Human visual QA of Scott DXF2013 in viewer ✅ DONE

**Completed:** 2026-05-09. George confirmed viewer usable.

---

### TASK-003: Phase 10I — Z-axis rotation tested INSERT regression ✅ DONE

**Completed:** 2026-05-09. Inline tests: 90°, 45°, rotation+scale, circle, arc, LWPOLYLINE, layer inheritance.

---

### TASK-006: Nested INSERT investigation (read-only audit) ✅ DONE

**Completed:** 2026-05-09. 314 nested INSERTs in block definitions, 138 INSERT instances blocked. Top parents: *U104, *U133, *U239.
