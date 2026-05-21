# Kairo Roadmap

Last updated: 2026-05-21
HEAD: current DXF package / GLB export branch

## Overall POC Readiness: ~82%

| Area | Readiness | Notes |
|---|---|---|
| Repo / workspace baseline | 90% | Monorepo, schema, validator, CLI, viewer all running; current suite is significantly broader than the original 151-test baseline |
| DXF parser compatibility | 88% | Pre-clean solves ACAD_REACTORS; R12, 2010, 2013 verified; production DXF coverage reports are available |
| DXF geometry coverage | 82% | Core layout geometry, text, common inserts, points, ellipses, splines, solids, and face entities are covered; hatches/dimensions remain the main gaps |
| Text completeness | 78% | TEXT, ATTDEF, ATTRIB, and MTEXT are visible in viewer/GLB paths; CAD-review text quality now depends on chosen export preset |
| Viewer usability | 78% | Drawing-first DXF loading, progress percentage, fit, layers, text controls, `.kairo` open/drop, and GLB/JT settings popup are in place |
| Selection / inspection | 45% | Functional but still needs a stronger engineering inspection panel and isolate workflow |
| QA / repeatability | 82% | CLI coverage, package validation, GLB handoff reports, and large-DXF package workflow are documented |
| Production robustness | 45% | `.kairo` packages avoid browser size limits; still no streaming importer, auth, cloud job queue, or durable project database |
| JT / export | 55% | GLB export exists; JT handoff works through CAD Exchanger GUI or Batch when licensed, but native JT writing remains parked |

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
| 12 | JT export | External CAD Exchanger handoff active; native JT writer parked unless Siemens JT Open Toolkit is authorized |
| 13 | `.kairo` package workflow for large DXFs | In progress |

## What Demo-Ready Means

A useful engineering PoC demo requires all of:

1. A real DXF file (Scott DSP layout) loads without errors in the viewer.
2. Viewer ergonomics allow comfortable inspection of a large flat 2D layout.
3. Text labels including station headers are visible and approximately correct.
4. Scene tree, layer list, selection highlight, and text density controls are usable.
5. Validation report shows zero errors.
6. Import report accounts for all skipped entities — no silent drops.
7. Large files can be converted to `.kairo` without browser upload.
8. GLB export settings are explicit enough for CAD Exchanger and Siemens Process Simulate handoff.

Current estimate for demo-ready: **package workflow + selection/isolate polish**. The geometry, layers, text, GLB handoff, and large-file strategy are in place. What's missing is practical engineering inspection workflow and repeated Siemens Process Simulate acceptance checks.

## Current Priority Roadmap

| Priority | Work | Why |
|---|---|---|
| P0 | Productize `.kairo` as the large-DXF cache | Removes the 300 MB browser limit and makes every later review repeatable |
| P0 | Keep conversion coverage visible in every report | Prevents silent entity loss and gives a real percentage complete |
| P1 | Siemens Process Simulate acceptance loop | Confirms scale, placement, tree grouping, and JT usability with real users |
| P1 | Layer/tree hide-show workflow | Lets engineers isolate equipment, border, text, and layout groups |
| P2 | Better selection/properties panel | Turns the viewer from visual QA into a useful engineering review tool |

## Parked Work

| Area | Reason |
|---|---|
| Native JT export | External CAD Exchanger handoff is the current route; native writer remains parked without a licensed Siemens toolkit |
| DWG direct parsing | Convert to DXF first (ODA or AutoCAD) |
| Full MTEXT rich formatting | Color, font, bold, italic, tables — not needed for current POC |
| Non-uniform scale INSERT expansion | 0 instances in Scott DXF2013; not worth implementing yet |
| Full browser automation / backend / auth / cloud | Scope far beyond current POC |
