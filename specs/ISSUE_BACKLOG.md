# Kairo Issue Backlog

Last updated: 2026-05-10

GitHub issue creation from ChatGPT is blocked (403). This file is the authoritative source of truth for all tracked issues until the connector is fixed. Keep in sync with KAIRO_TASKS.md.

---

## Status key

| Code | Meaning |
|---|---|
| NOW | Active — work may start immediately |
| NEXT | Ready — do after all NOW items complete |
| BLOCKED | Waiting on external dependency or decision |
| LATER | Valid but not current priority |
| DONE | Complete and verified |

## Priority key

| Code | Meaning |
|---|---|
| P0 | Blocking further QA or planning |
| P1 | Significant usability or workflow value |
| P2 | Useful but not urgent |
| P3 | Future / parked |

---

## ISSUE-001 — Scott DXF outlier / floater audit

- **Status:** NOW
- **Priority:** P0

**Goal:**
Identify and explain the small entities floating far away from the main Scott layout.

**Why it matters:**
Floaters may indicate bad transforms, wrong block base points, text anchor bugs, or actual drawing reference geometry. We must not hide or delete them blindly. Phase 10T-A confirmed the top-6 outliers are mathematically correct (block-local coordinates amplified by INSERT rotation + position). However the full 5,506 outlier count has not been classified into categories, and George still sees distracting floaters in the viewer.

**Allowed scope:**
- Use existing `scene-outliers` CLI command
- Improve scene-outliers reporting if small change (e.g. add layer name, block name, entity type to output)
- Create `specs/SCOTT_DXF_OUTLIER_AUDIT.md`
- Identify layer, source entity type, handle, source path, coordinates/bounds, block/insert chain for top outliers

**Not allowed:**
- Do not delete geometry
- Do not hide outliers automatically
- Do not change importer transforms unless root cause is proven
- Do not touch GLB/JT/export

**Acceptance criteria:**
- Top outliers listed with source handles and coordinates
- Outlier categories classified (correct far-field equipment vs. transform bug vs. reference geometry)
- Recommended fix path documented in audit file
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
node packages/cli/dist/index.js scene-outliers ".\tmp\scott-dxf2013-import"
```

**Suggested commit:** `docs: add scott dxf outlier audit`

**Notes / dependencies:** Builds on Phase 10T-A scene-outliers CLI already in place.

---

## ISSUE-002 — Selection and inspection usability

- **Status:** NEXT
- **Priority:** P0

**Goal:**
Make it possible to click/select visible drawing geometry and understand what it is.

**Why it matters:**
George needs practical drawing review: select entity, see layer/type/handle/source chain, fit selected, and diagnose missing or wrong geometry. Current selection works but panel details are minimal.

**Allowed scope:**
- Improve curve picking tolerance
- Add hover highlight
- Add selected entity panel details: layer, entity type, handle, source path, block/insert chain, text content if label
- Improve fit-selected behavior
- Add isolate-by-layer or isolate-by-source if simple

**Not allowed:**
- Do not redesign the viewer
- Do not change importer unless source data is proven missing
- Do not touch GLB/JT/export

**Acceptance criteria:**
- User can click visible entity
- Selected geometry highlights clearly
- Source / layer / type shown in panel
- Fit-selected works and zooms to selection
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass
- Manual QA: `http://localhost:5173/?scene=scott-dxf2013-import`

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `feat: improve viewer selection and inspection`

---

## ISSUE-003 — Text placement and alignment correctness

- **Status:** NEXT
- **Priority:** P0

**Goal:**
Improve TEXT/MTEXT placement so labels match the DXF reference more closely.

**Why it matters:**
MTEXT now appears (Phase 10T-B + MTEXT scanner), but alignment, attachment point, and anchor semantics are still approximate. Known issues: horizontal alignment (left/center/right), vertical alignment (top/middle/base/bottom), MTEXT attachment point (top-left vs center, etc.).

**Allowed scope:**
- Investigate TEXT horizontal alignment (group 72) and vertical alignment (group 73)
- Investigate MTEXT attachment point (group 71)
- Investigate insertion point vs second alignment point behavior
- Add smallest schema-safe fields only if proven needed
- Add overlay placement unit tests

**Not allowed:**
- Do not add full rich MTEXT formatting (color, font, bold, italic, etc.)
- Do not redesign viewer
- Do not break existing TEXT/MTEXT display
- Do not touch GLB/JT/export

**Acceptance criteria:**
- Large headers remain visible and at correct drawing locations
- Known center/right/top/middle alignment cases improve vs. DXF reference
- Density and readable controls still work
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `feat: improve dxf text placement alignment`

**Notes / dependencies:** Builds on Phase 10T-B (text overlay) and MTEXT scanner (c1241f1).

---

## ISSUE-004 — Viewer UI drawing-first review mode

- **Status:** NEXT
- **Priority:** P1

**Goal:**
Make the viewer default UI better for large DXF drawing review.

**Why it matters:**
Current UI has side panels occupying significant screen space. For large DXF drawings, canvas space is the primary value and panels should be secondary.

**Allowed scope:**
- Maximize canvas space by default
- Add clear toolbar: Fit scene, Top 2D, 3D, Fit selected, Layers, Text, Diagnostics
- Make Layers the main side panel with: color swatch, layer name, count, visibility toggle, isolate (if simple)
- Move diagnostics behind toggle / collapsed by default
- Add simple text controls: Off / Auto / All / Readable

**Not allowed:**
- Do not touch importer
- Do not touch schema
- Do not touch GLB/JT/export
- Do not remove sample scene support

**Acceptance criteria:**
- Default view gives drawing maximum practical canvas space
- Layers are easy to access
- Diagnostics are accessible but not visually dominant
- Scott scene and default sample scene still work
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `feat: make viewer landing ui drawing-first`

---

## ISSUE-005 — Mouse wheel zoom toward cursor

- **Status:** NEXT
- **Priority:** P1

**Goal:**
Make mouse wheel zoom toward the current mouse position in the viewer.

**Why it matters:**
Current zoom is center-of-viewport which makes navigation around a large drawing feel imprecise and slow.

**Allowed scope:**
First investigate whether installed Three.js OrbitControls supports `controls.zoomToCursor = true`:
- If supported: enable it, test orthographic view, test top-2D view, ensure pan/zoom/fit still work
- If not supported: report smallest safe custom approach; do not implement a large custom zoom system

**Not allowed:**
- Do not touch importer
- Do not touch schema
- Do not touch text rendering unless required by camera updates
- Do not touch GLB/export

**Acceptance criteria:**
- Mouse wheel zooms toward cursor position
- Fit scene still works
- Pan still works
- Top 2D and 3D views still work
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `feat: zoom viewer toward mouse cursor`

---

## ISSUE-006 — Layer controls and isolate workflow

- **Status:** NEXT
- **Priority:** P1

**Goal:**
Make layers useful for large DXF drawing review.

**Why it matters:**
Scott DXF2013 has many layers. Quickly isolating or hiding noisy layers is essential for visual QA of specific geometry.

**Allowed scope:**
- Layer search / filter
- Isolate layer (hide all except selected)
- Show all / hide all except selected
- Show layer entity counts
- Keep layer colors visible
- Keyboard shortcut or button for "show all"

**Not allowed:**
- Do not change importer
- Do not redesign full viewer

**Acceptance criteria:**
- User can quickly isolate noisy layers
- User can restore all layers
- Layer counts remain visible
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `feat: improve dxf layer review controls`

---

## ISSUE-007 — Nested INSERT investigation

- **Status:** LATER
- **Priority:** P2

**Goal:**
Investigate remaining 14 nested INSERTs that hit the depth-3+ guard, and plan safe one-extra-level expansion.

**Why it matters:**
14 INSERT instances are currently blocked. These likely contain geometry not visible in the viewer. Expanding safely requires cycle detection and a depth guard.

**Allowed scope:**
- Audit nested INSERT count and top block names for depth-3+ cases
- Plan safe one-extra-level expansion (depth-3 only)
- Design cycle detection approach
- Design depth guard update
- Write transform chain tests

**Not allowed:**
- Do not implement recursion until plan is approved
- Do not support arbitrary nesting depth
- Do not support non-uniform or negative scale unless separately planned

**Acceptance criteria:**
- Nested INSERT report exists with block names and counts
- Safe expansion subset defined and documented
- Tests planned before implementation
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `docs: plan nested dxf insert expansion`

---

## ISSUE-008 — Complex POLYLINE / spline-fit policy

- **Status:** LATER
- **Priority:** P2

**Goal:**
Decide how to handle remaining complex POLYLINE / spline-fit geometry that is not currently imported.

**Why it matters:**
Phase 10N-B handles spline-fit POLYLINEs using pre-sampled fitting vertices. There may be remaining edge cases (3D mesh POLYLINEs, polyface mesh, etc.) that need a documented policy.

**Allowed scope:**
- Audit remaining POLYLINE-related warnings
- Decide approximation policy for each remaining type
- Import pre-sampled fit vertices only if deterministic
- Warn clearly when approximation is used

**Not allowed:**
- Do not guess spline math
- Do not silently convert complex geometry without warning

**Acceptance criteria:**
- Policy documented for each POLYLINE variant
- Unsupported count explained
- Approximation warnings deterministic and stable
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `docs: define complex dxf polyline policy`

---

## ISSUE-009 — Render performance / batching baseline

- **Status:** LATER
- **Priority:** P2

**Goal:**
Keep large DXF scenes responsive as geometry and text count grows.

**Why it matters:**
Scott DXF2013 now has ~245k curve entities + 1092 text entities. Phase 10P established a batched render architecture. As features grow (more text, more geometry), performance must be monitored.

**Allowed scope:**
- Measure entity counts and load time at current HEAD
- Identify render bottlenecks (JSON fetch/parse, Float32Array assembly, React tree, Zod validation)
- Plan batching / instancing / virtualized text if needed

**Not allowed:**
- Do not prematurely rewrite the renderer
- Do not add large dependencies without approval

**Acceptance criteria:**
- Performance baseline documented
- Bottlenecks ranked
- Next optimization step clearly described
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Verification commands:**
```
pnpm test
pnpm typecheck
pnpm build
```

**Suggested commit:** `docs: add viewer performance baseline`

---

## ISSUE-010 — Fast viewer QA workflow documentation

- **Status:** NEXT
- **Priority:** P1

**Goal:**
Have a repeatable, low-friction workflow for import → validate → stage → open → inspect the Scott DXF.

**Why it matters:**
Without a documented and up-to-date QA workflow, each new session wastes time reconstructing the steps. The current `VIEWER_QA_WORKFLOW.md` predates MTEXT, density modes, and text overlay.

**Required workflow to document:**
```
node packages/cli/dist/index.js import-dxf "<DXF2013 path>" ".\tmp\scott-dxf2013-import"
node packages/cli/dist/index.js validate ".\tmp\scott-dxf2013-import"
node packages/cli/dist/index.js stage-viewer-scene ".\tmp\scott-dxf2013-import" scott-dxf2013-import
pnpm --filter @kairo/viewer dev
```
Open: `http://localhost:5173/?scene=scott-dxf2013-import`

**Allowed scope:**
- Update `specs/VIEWER_QA_WORKFLOW.md`
- Add text overlay checklist items
- Add expected warning counts
- Add common failure diagnosis entries

**Acceptance criteria:**
- Commands documented
- Manual checklist updated to include text/MTEXT items
- Common failure signs documented
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Suggested commit:** `docs: update fast viewer qa workflow`

---

## ISSUE-011 — Repo workflow / GitHub issue fallback

- **Status:** NOW
- **Priority:** P1

**Goal:**
Keep planning reliable even while ChatGPT GitHub issue creation is blocked.

**Current situation:**
- GitHub repo is accessible and readable via ChatGPT connector.
- Issue creation from ChatGPT fails with 403 Forbidden.
- George can create issues manually from the browser.
- This ISSUE_BACKLOG.md is now the authoritative source of truth.

**Allowed scope:**
- Maintain `specs/ISSUE_BACKLOG.md` (this file)
- Maintain `specs/KAIRO_TASKS.md`
- Maintain `specs/KAIRO_STATUS.md`
- Optionally include GitHub CLI commands George can run manually for issue creation

**Not allowed:**
- Do not attempt programmatic GitHub issue creation via API in code

**Acceptance criteria:**
- This file contains all active tasks
- Each task has scope, acceptance criteria, and verification commands
- Next phase can be launched from docs alone without GitHub

**GitHub CLI commands for manual issue creation (George runs these):**
```
gh issue create --title "ISSUE-001: Scott DXF outlier/floater audit" --body "..."
```

**Suggested commit:** `docs: add issue backlog fallback workflow`

---

## ISSUE-012 — Claude skills for Kairo

- **Status:** NEXT
- **Priority:** P2

**Goal:**
Create reusable Claude Code skills for Kairo so each session starts with consistent context and constraints.

**Why it matters:**
Without skills, each Claude session risks overstepping allowed scope (e.g. touching importer when asked to fix viewer, or starting JT work). Skills define the guardrails.

**Recommended files:**
- `.claude/skills/kairo-main-workflow.md`
- `.claude/skills/kairo-viewer-ui.md`
- `.claude/skills/kairo-dxf-importer.md`
- `.claude/skills/kairo-planning.md`

**Allowed scope:**
- Create `.claude/skills/` directory and skill files
- Each skill should define: goal, allowed scope, not-allowed scope, verification commands

**Acceptance criteria:**
- Skills exist in `.claude/skills/`
- Each skill has clear allowed/not-allowed rules
- Claude can be instructed: "Use Kairo Main Workflow Skill"
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass

**Suggested commit:** `chore: add kairo claude skills`

---

## ISSUE-013 — JT export future roadmap

- **Status:** LATER (PARKED)
- **Priority:** P3

**Goal:**
Keep JT export parked until Kairo viewer and importer are stable enough to be worth exporting.

**Why it matters:**
JT is the target format for downstream CAD/PLM tools. But implementing it now would distract from DXF coverage and viewer usability. It is explicitly parked.

**Notes:**
- Target is likely legacy faceted JT only (not full parametric JT)
- Do not hand-write raw JT binary — use Siemens JT Open Toolkit or a converter
- First prove compatibility with a reference viewer (e.g. JT2Go)
- Not active development now

**Acceptance criteria:**
- Roadmap clearly marks JT as parked
- No current agent starts JT work without explicit re-authorization

**Suggested commit:** `docs: park jt export roadmap`

---

## Summary table

| ID | Title | Status | Priority |
|---|---|---|---|
| ISSUE-001 | Scott DXF outlier/floater audit | NOW | P0 |
| ISSUE-011 | Repo workflow / GitHub issue fallback | NOW | P1 |
| ISSUE-002 | Selection and inspection usability | NEXT | P0 |
| ISSUE-003 | Text placement and alignment correctness | NEXT | P0 |
| ISSUE-004 | Viewer UI drawing-first review mode | NEXT | P1 |
| ISSUE-005 | Mouse wheel zoom toward cursor | NEXT | P1 |
| ISSUE-006 | Layer controls and isolate workflow | NEXT | P1 |
| ISSUE-010 | Fast viewer QA workflow documentation | NEXT | P1 |
| ISSUE-012 | Claude skills for Kairo | NEXT | P2 |
| ISSUE-007 | Nested INSERT investigation | LATER | P2 |
| ISSUE-008 | Complex POLYLINE / spline-fit policy | LATER | P2 |
| ISSUE-009 | Render performance / batching baseline | LATER | P2 |
| ISSUE-013 | JT export future roadmap | LATER (PARKED) | P3 |
