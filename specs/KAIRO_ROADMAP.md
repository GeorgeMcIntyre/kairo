# Kairo Roadmap

Last updated: 2026-05-09  
HEAD: 5a7c008 feat: improve dxf viewer fit and line visibility

## Overall POC Readiness: ~50%

| Area | Readiness | Notes |
|---|---|---|
| Repo / workspace baseline | 85% | Monorepo, schema, validator, CLI, viewer all running |
| DXF parser compatibility | 80% | Pre-clean solves ACAD_REACTORS; R12, 2010, 2013 verified |
| DXF geometry coverage | 55% | LINE/LWPOLYLINE/CIRCLE/ARC/POLYLINE/simple INSERT done; hatches, splines, text, nested INSERT missing |
| Viewer usability | 50% | Top-2D and perspective modes, fit, selection; ergonomics improved for large layouts; visual QA still needed |
| QA / repeatability | 45% | 68 tests passing; no automated visual QA yet |
| Production robustness | 20% | PoC only; no error recovery, no streaming, no auth |
| JT / export | 5% | Parked; licensed toolkit work not started |

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
| **10I** | **Z-axis rotation tested, full INSERT regression** | **Next** |
| 10J | Nested INSERT investigation (read-only audit, no expansion yet) | Planned |
| 10K | Text / ATTDEF metadata strategy (report only) | Planned |
| 10L | Complex POLYLINE (spline-fit, curve-fit) strategy | Planned |
| 10M | Performance / batching for large scenes | Planned |
| 11 | GLB export | Parked |
| 12 | JT export | Parked — requires licensed Siemens toolkit |

## What Demo-Ready Means

A useful engineering PoC demo requires all of:

1. A real DXF file (e.g. Scott DSP layout) loads without errors in the viewer.
2. Viewer ergonomics allow comfortable inspection of a large flat 2D layout.
3. Scene tree, layer list, and selection highlight are usable.
4. Validation report shows zero errors.
5. Import report accounts for all skipped entities — no silent drops.
6. The full QA workflow runs in under 5 minutes from a fresh DXF file.

Current estimate for demo-ready: **Phase 10I + visual QA confirmation**.
