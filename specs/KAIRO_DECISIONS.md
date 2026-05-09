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
