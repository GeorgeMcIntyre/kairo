# Kairo Public Demo Checklist

Last updated: 2026-06-06

This checklist verifies the Cloudflare-hosted Kairo viewer public demo and the `.kairo` package sharing path. It covers browser-facing smoke only; exporter code, CAD Exchanger probes, importer tuning, and schema changes are outside this checklist.

## Current URLs

```text
Branch alias: https://codex-kairo-dxf-block-instan.kairo-viewer-6lh.pages.dev
Latest immutable deploy: https://b5859425.kairo-viewer-6lh.pages.dev
```

Use the branch alias for routine QA. Use the immutable URL when verifying the exact 2026-06-06 deployment recorded in `specs/DEPLOY_CLOUDFLARE.md`.

## Local Verification

Run from the repo root before deploying:

```powershell
pnpm typecheck
pnpm test --run
pnpm run build:cloudflare
```

Expected Cloudflare output:

```text
apps/viewer/dist/index.html
apps/viewer/dist/assets/
apps/viewer/dist/_redirects
```

Expected `_redirects`:

```text
/* /index.html 200
```

`apps/viewer/dist/scenes` must not exist in the public Pages build. The staged Scott scene payload is intentionally pruned because the generated source-map and at least one geometry document exceed practical Pages static-asset limits.

## Public Pages Smoke

Run the non-browser HTTP smoke first:

```powershell
pnpm smoke:pages
```

This verifies the Pages app shell, linked JS/CSS assets, current viewer control labels in the deployed JS bundle, SPA fallback route, and that the heavy Scott staged manifest is not deployed as public JSON. It does not verify canvas rendering, toolbar interaction, file-picker upload, or browser console state.

Run in Chrome or Edge.

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Open `https://codex-kairo-dxf-block-instan.kairo-viewer-6lh.pages.dev` | Viewer landing loads without HTTP or console errors | |
| Confirm toolbar at 1280 px width | `Open DXF / Kairo`, `Load Demo Layout`, Fit controls, view controls, Layers/Text/Semantics/Inspector/Workbench controls are readable without horizontal page scroll | |
| Click `Load Demo Layout` | Bundled sample scene loads; no scene-load error appears | |
| Confirm URL after demo load | URL has no stale `?scene=scott-dxf2013-import` query | |
| Click `Fit scene`, `Fit main`, `Top 2D`, `3D`, `Fit selected` | Buttons remain responsive; no blank canvas | |
| Toggle Layers panel | Panel opens/closes without breaking canvas layout | |
| Toggle Semantics and Inspector panels | Panels open/close without breaking canvas layout | |
| Open Text menu and switch Auto / All / Off | Text control state changes without layout overlap | |
| Open `/nonexistent-route` on the Pages alias | App shell loads through `_redirects` rather than Cloudflare 404 | |
| Check browser console | No uncaught runtime errors | |

## Public Demo Boundary

`Load Demo Layout` uses the bundled sample scene. It does not fetch `scenes/scott-dxf2013-import/*` on Pages.

If `?scene=scott-dxf2013-import` is opened on the public Pages URL, the viewer should return to the local-file flow with a readable message because the Scott staged scene assets are not deployed. This is expected; use a `.kairo` package for Scott sharing.

## `.kairo` Package Sharing QA

First create and validate the Scott package locally:

```powershell
pnpm smoke:kairo-package
```

Known 2026-06-06 result:

```text
tmp\scott-dxf2013-import.kairo
9,884,877 bytes
29 nodes
28 geometry documents
34 archive entries
28 geometry entries
160 layers
246,046 source-map rows
244,953 curve entities
1,092 text entities
0 validation findings
```

Then verify in the deployed viewer:

| Check | Expected Result | Pass / Fail / Notes |
|---|---|---|
| Open the Pages branch alias | Viewer landing appears | |
| Click `Open DXF / Kairo` | File picker opens | |
| Choose `tmp\scott-dxf2013-import.kairo` | Viewer opens package and reports `Opened scott-dxf2013-import.kairo` or equivalent | |
| Wait for first render | Scott geometry is visible; canvas is not blank | |
| Click `Fit main` and `Top 2D` | Drawing remains visible and centered | |
| Search/filter Layers for `7B` | Matching layers appear with entity counts, or clear evidence if no layer name matches | |
| Use per-layer `Show only`, then `Show all` | Isolate state visibly changes and recovers | |
| Toggle Text Auto / All / Off | Labels respond without freezing the viewer | |
| Open Diagnostics | Package scene stats and timing/status are readable | |
| Open Workbench | Project / Library Workbench opens without runtime errors | |
| Check browser console | No uncaught runtime errors during package open or panel toggles | |

## Known Limitations

- Public Pages does not include the heavy Scott staged scene assets under `dist/scenes`.
- The public demo's built-in sample is intentionally small; it proves the hosted app shell and viewer controls, not Scott layout fidelity.
- Scott layout browser QA must use local DXF open, local staged-scene dev server, or the `.kairo` package upload path.
- Viewer bundle still has the known Vite chunk-size warning.
- Browser/canvas QA is manual until browser automation is available.
