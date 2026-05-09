# Kairo Architecture Decisions

Last updated: 2026-05-09

---

## ADR-001: Main-only workflow

**Decision:** All work commits directly to `main`. No feature branches unless a change carries genuine rollback risk.  
**Reason:** PoC pace; GitHub Issues are currently unreliable from external tools; branches add ceremony without benefit at this scale.  
**Exceptions:** A branch is acceptable only when a change is large enough that partial rollback would otherwise be destructive. Decide per-change.

---

## ADR-002: Repo-based planning instead of GitHub Issues

**Decision:** Planning lives in `specs/KAIRO_TASKS.md`, `specs/KAIRO_STATUS.md`, and `specs/KAIRO_ROADMAP.md`.  
**Reason:** GitHub Issues were found to be unreliable when accessed from ChatGPT/AI tooling (stale data, creation failures). Specs files are in the repo, always in sync with HEAD.  
**Review:** Revisit if the project grows a team or a CI pipeline.

---

## ADR-003: DXF first; JT parked

**Decision:** All import work targets DXF. JT export is acknowledged but parked until the licensed Siemens toolkit is available.  
**Reason:** DXF is open and testable with real files now. JT export requires a separate licensed SDK and is a separate engineering effort.

---

## ADR-004: No full CAD fidelity

**Decision:** The importer is warning-driven. Unsupported entities are reported in the import report and never silently dropped or approximated without explicit tests.  
**Reason:** Silent data loss in a neutral engineering format defeats the format's purpose. A complete import report is more valuable than an approximate geometry for unsupported entity types.

---

## ADR-005: Safe subset expansion only

**Decision:** INSERT expansion is implemented only for the safe subset: curve-only blocks, one level deep, positive uniform scale, Z-axis rotation, no nested INSERTs, no text/attribute geometry.  
**Reason:** Full INSERT expansion (nested, non-uniform scale, negative scale, attributes) expands scope rapidly and is prone to silent geometry errors. Each expansion category requires dedicated test fixtures before implementation.

---

## ADR-006: Visual QA before importer expansion

**Decision:** Before each new importer expansion phase, human visual QA of the current scene in the viewer is required.  
**Reason:** Automated tests verify schema correctness; they cannot verify geometry is visually correct. A confirmed visual baseline prevents regressions from being invisible.

---

## ADR-007: DXF parser behind a narrow adapter

**Decision:** `@dxfjs/parser` is used via a narrow adapter in `packages/importer-dxf`. The adapter boundary isolates parser-specific types from Kairo schema types.  
**Reason:** Available TypeScript DXF parsers vary in maintenance and entity coverage. The adapter makes parser replacement possible without touching the rest of the importer.

---

## ADR-008: No raw JT writer

**Decision:** A hand-written JT binary writer is not in scope. JT export will use the licensed Siemens toolkit or a well-maintained wrapper, not a home-grown binary format writer.  
**Reason:** JT is a complex binary format with version history. A hand-written writer would require significant reverse engineering and carries high risk of producing invalid files.

---

## ADR-010: Phase 10N-B POLYLINE spline-fit approach — use pre-sampled fitting vertices, not B-spline math

**Decision:** When Phase 10N-B is implemented, expand spline-fit POLYLINEs by collecting the vertices with `flag & 8` (spline vertices created by AutoCAD's spline-fitting pass) as a pre-sampled polyline chain. Do not implement B-spline evaluation math.

**Vertex flag semantics (confirmed by Phase 10N-A diagnostic test):**
- POLYLINE `flag & 4` = spline-fit POLYLINE
- VERTEX `flag & 8` = spline vertex on the fitted curve — **use these as the output chain**
- VERTEX `flag & 16` = spline frame control point (original input, not on the curve) — **skip these**
- POLYLINE `flag & 2` = curve-fit POLYLINE; VERTEX `flag & 1` = curve-fit generated vertex — same pattern

**Reason:** AutoCAD already pre-samples the spline at the time it writes the DXF. The `flag & 8` vertices are the ready-to-use piecewise linear approximation. B-spline math would re-derive the same points at extra complexity and risk.

**Confirmed by:** Phase 10N-A — `@dxfjs/parser` maps group 70 to `VertexEntity.flag`; values 8 and 16 are preserved at runtime (test: `"@dxfjs/parser exposes VERTEX flag (group 70) on spline-fit POLYLINE vertices"`).

---

## ADR-009: Viewer performance invariant — one object per geometry document, not per entity

**Decision:** The viewer renders one `THREE.LineSegments` per geometry document (curve-set). All curve entities within a document are merged into a single `Float32Array` and uploaded as a single draw call. Layer visibility, fit, and selection never trigger a full Three.js scene rebuild.

**Accepted trade-offs:**
- Lines render at 1 px width (no screen-space thickness).
- All entities in a geometry document share the layer color; per-entity color overrides are not rendered.
- Circle tesselation: 32 segments. Arc tesselation: 24 segments.

**Performance invariants — do not violate in future changes:**
- No one Three.js object per curve entity.
- No one material per curve entity.
- No full scene rebuild on layer toggle, fit, or selection.
- Layer toggle: `object.visible = bool` only.
- Fit: reposition camera using cached `Box3`; do not recompute from entity data.
- Selection highlight: update `material.color` only.

**Reason:** Scott DXF2013 has 142,378 curve entities. Before Phase 10P, one `Line2` per entity caused ~142,378 draw calls per frame; layer toggle triggered a full rebuild of all Three.js geometry. After Phase 10P the scene loads in ~5 s and interaction is smooth. These invariants must be maintained as entity counts grow.
