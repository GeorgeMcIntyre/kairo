# Cloudflare Pages Deployment Notes

## Build output directory

The Cloudflare Pages build output directory must be set relative to the **repository root**, not relative to the app subfolder:

```
apps/viewer/dist
```

If you set it to `dist` (the Vite default), Pages will look in the wrong place and deploy an empty site.

**Cloudflare Pages dashboard settings:**
- Build command: `pnpm --filter @kairo/viewer build`
- Build output directory: `apps/viewer/dist`
- Root directory: *(leave blank — repo root)*
- Framework preset: *None (manual config)*
- Environment variables:
  - `NODE_VERSION` = `20`
  - `PNPM_VERSION` = `10.17.0`

> These environment variables are required. Cloudflare Pages defaults to an older Node/pnpm version; without them the monorepo build will fail at the `pnpm install` step.

No Cloudflare Workers are required. This is a fully static Pages deployment.

Current main verification (2026-05-10, HEAD `644eb03`): `pnpm build` completes successfully with the expected viewer chunk-size warning only.

---

## Post-build local check

Before deploying, verify the output directory contains the expected files:

```
dir apps\viewer\dist
dir apps\viewer\dist\scenes\scott-dxf2013-import
```

Expected `dist` contents: `index.html`, `assets/`, `scenes/`.  
Expected `scenes/scott-dxf2013-import` contents: `manifest.json`, `scene.json`, `layers.json`, `materials.json`, `source-map.json`, `geometry/`.

If `scenes/` is missing, run the CLI staging command before building:

```
node packages/cli/dist/index.js stage-viewer-scene ".\tmp\scott-dxf2013-import" scott-dxf2013-import
```

There is no `stage` script in `apps/viewer/package.json`; use the CLI command above.

---

## Large scene JSON files — future consideration

The scene JSON files under `apps/viewer/public/scenes/` (geometry documents, source maps) are included directly in the Pages deployment for demo purposes. For the Scott DXF2013 scene these files are large.

This is acceptable for early demos. If the project scales or requires fast cold-load times, consider:

- **Compression** — enable Cloudflare's automatic Brotli/gzip compression for JSON assets (on by default for Pages); verify it is active.
- **Lazy loading** — the viewer already fetches geometry documents on demand (`loadPublicScenePackage`); ensure geometry is split into per-document files rather than one monolithic file.
- **Separate object storage** — move large scene assets to R2 (or another CDN) and serve them from a different origin, keeping the Pages deploy small and fast.

No changes to the importer, schema, or viewer are required to adopt any of these strategies.

---

## Rollback

If a bad deploy ships:

1. In the Cloudflare Pages dashboard, open the project → **Deployments** tab.
2. Find the last known-good deployment in the list.
3. Click the three-dot menu → **Rollback to this deployment**.
4. Cloudflare will re-promote that build to production instantly (no rebuild required).

Alternatively, revert the offending commit on `main` and push — Cloudflare will trigger a new build automatically.
