# Kairo Roadmap

Last updated: 2026-05-10
HEAD: c1241f1 feat: extract MTEXT entities and keep big labels visible at fit-scene

## Overall POC Readiness: ~70%

| Area | Readiness | Notes |
|---|---|---|
| Repo / workspace baseline | 90% | Monorepo, schema, validator, CLI, viewer all running; tests 151/151 |
| DXF parser compatibility | 85% | Pre-clean solves ACAD_REACTORS; R12, 2010, 2013 verified; MTEXT scanner added |
| DXF geometry coverage | 75% | LINE/LWPOLYLINE/CIRCLE/ARC/POLYLINE/INSERT (incl. mirror, z-offset, nested)/TEXT/ATTDEF/MTEXT done; hatches, dimensions, splines missing |
| Text completeness | 70% | TEXT, ATTDEF, MTEXT visible; alignment/attachment semantics approximate; MTEXT inside block INSERTs not expanded |
| Viewer usability | 65% | Top-2D, perspective, fit, selection, layers, text overlay with density modes; drawing-first UI and zoom-to-cursor still needed |
| Selection / inspection | 35% | Functional but not practical: panel shows minimal details, picking tolerance needs work |
| QA / repeatability | 70% | 151 tests passing; documented QA workflow; no automated visual QA yet |
| Production robustness | 25% | PoC only; no error recovery, no streaming, no auth |
| JT / export | 5% | Parked — requires Siemens JT Open Toolkit |

## Phase History

| Phase | Description | Status |
|---|---|---|
| 1 | Repo scaffold (pnpm, TS, Vite, React, Three.js, Zod, Vitest) | Done |
| 2 | Schema and core model | Done |
| 3 | Validator | Done |
| 4 | Sample scene | Done |
| 5 | Viewer (tree, viewport, properties, diagnostics) | Done |
| 6 | Format hardening (golden tests, invalid fixtures) | Done |
| 7 | CLI validate tool | Done |
| 8 | DXF import investigation | Done |
| 9 | Minimal DXF importer vertical slice | Done |
| 10A | DXF pre-clean (ACAD_REACTORS, EOF) | Done |
| 10B | inspect-dxf CLI command | Done |
| 10C | Simple POLYLINE vertex chain import | Done |
| 10D | Safe simple INSERT expansion (curve-only, uniform scale, Z rotation) | Done |
| 10E | Dev scene loader for generated scene folders | Done |
| 10F | INSERT rotation support (Z-axis) | Done |
| 10G | Viewer ergonomics for large 2D DXF layouts | Done |
| 10H | Viewer fit and line visibility improvements | Done |
| 10I | Z-axis rotation tested, full INSERT regression | Done |
| 10J | Nested INSERT investigation (read-only audit) | Done |
| 10K | Partial block expansion (mixed entity types) | Done |
| 10L | Z-offset INSERT expansion (2D projection) | Done |
| 10M | One-level nested INSERT expansion | Done |
| 10N-A | POLYLINE parser investigation | Done |
| 10N-B | Spline-fit POLYLINE expansion via pre-sampled vertices | Done |
| 10O-A | Text/attribute/equipment audit | Done |
| 10P | Viewer performance — LineSegments batching, 4-effect split | Done |
| 10R-A | Transform complexity audit | Done |
| 10S | Uniform-magnitude mirror INSERT expansion | Done |
| 10T-A | Visual QA spike — scene-outliers CLI | Done |
| 10T-B | TEXT/ATTDEF rendering (HTML overlay) | Done |
| 10T-C | MTEXT scanner + label density modes + readable toggle | Done |
| **ISSUE-001** | **Scott DXF outlier/floater audit** | **Next** |
| **ISSUE-002** | **Selection and inspection usability** | **Next** |
| **ISSUE-003** | **Text placement and alignment correctness** | **Next** |
| **ISSUE-004** | **Viewer UI drawing-first review mode** | **Next** |
| **ISSUE-005** | **Mouse wheel zoom toward cursor** | **Next** |
| **ISSUE-006** | **Layer controls and isolate workflow** | **Next** |
| ISSUE-007 | Nested INSERT investigation (depth-3+) | Later |
| ISSUE-008 | Complex POLYLINE / spline-fit policy | Later |
| ISSUE-009 | Render performance / batching baseline | Later |
| 11 | GLB export | CAD Exchanger handoff implemented; production exporter still later |
| 12 | JT export | Parked — requires licensed Siemens toolkit |

## What Demo-Ready Means

A useful engineering PoC demo requires all of:

1. A real DXF file (Scott DSP layout) loads without errors in the viewer.
2. Viewer ergonomics allow comfortable inspection of a large flat 2D layout.
3. Text labels including station headers are visible and approximately correct.
4. Scene tree, layer list, selection highlight, and text density controls are usable.
5. Validation report shows zero errors.
6. Import report accounts for all skipped entities — no silent drops.
7. The full QA workflow runs in under 5 minutes from a fresh DXF file.

Current estimate for demo-ready: **After ISSUE-002 (selection) + ISSUE-004 (drawing-first UI)**. The geometry, layers, and text are largely in place. What's missing is practical ergonomics for inspection and review.

## Parked Work

| Area | Reason |
|---|---|
| JT export | Requires Siemens JT Open Toolkit; not started; do not begin without re-authorization |
| GLB export | Browser CAD Exchanger handoff exists for line/triangle geometry; richer production exporter remains later |
| DWG direct parsing | Convert to DXF first (ODA or AutoCAD) |
| Full MTEXT rich formatting | Color, font, bold, italic, tables — not needed for current POC |
| Non-uniform scale INSERT expansion | 0 instances in Scott DXF2013; not worth implementing yet |
| Full browser automation / backend / auth / cloud | Scope far beyond current POC |
