# Cloudflare Pages Deployment Notes

Canonical deployment checklist: `specs/KAIRO_CLOUDFLARE_DEPLOYMENT.md`.

## Build output directory

The Cloudflare Pages build output directory must be set relative to the **repository root**, not relative to the app subfolder:

```text
apps/viewer/dist
```

If you set it to `dist` (the Vite default), Pages will look in the wrong place and deploy an empty site.

**Cloudflare Pages dashboard settings:**

- Build command: `pnpm run build:cloudflare`
- Build output directory: `apps/viewer/dist`
- Root directory: leave blank / repo root
- Framework preset: None / manual config
- Environment variables:
  - `NODE_VERSION=20`
  - `PNPM_VERSION=10.17.0`

These environment variables are required. Cloudflare Pages defaults to an older Node/pnpm version; without them the monorepo build will fail at the `pnpm install` step.

No Cloudflare Workers are required for the static app shell.

## Required Access Protection

Kairo previews and production deployments must be protected before any company layout, hosted DXF, or generated scene asset is made reachable from Cloudflare.

Configure Cloudflare Zero Trust / Access:

1. Open Cloudflare Zero Trust -> Access -> Applications.
2. Add a self-hosted application for `kairo-viewer.pages.dev`.
3. Add a second application or additional hostname for `*.kairo-viewer.pages.dev` so preview deployments are covered too.
4. Add an Allow policy for approved user emails or the approved identity-provider team/group only.
5. Leave everyone else denied. Do not add public bypass rules.
6. If a custom domain is added later, add that hostname to the same Access policy before sharing it.

Sensitive DXF policy:

- Do not expose company DXF files publicly.
- Do not use public R2 bucket URLs for sensitive layouts.
- Prefer an Access-protected domain, an authenticated proxy, or short-lived signed URLs for hosted DXF downloads.
- `VITE_KAIRO_DEMO_DXF_URL` may only point to an approved protected or signed URL.
- Do not hardcode sensitive DXF URLs in viewer code.
- Do not commit secrets, account IDs, private URLs, signed URLs, or API tokens.

## Post-build local check

Before deploying, verify the output directory contains the expected app shell files:

```powershell
pnpm run build:cloudflare
dir apps\viewer\dist
```

Expected slim `dist` contents: `index.html`, `assets/`, `_redirects`. The `scripts/prepare-cloudflare-pages-dist.mjs` step removes local staged-scene payloads from `dist/scenes` and fails if any remaining static asset exceeds the Pages single-file asset budget.

For local staged-scene development only, `apps/viewer/public/scenes/scott-dxf2013-import` may exist and should contain:

- `manifest.json`
- `scene.json`
- `layers.json`
- `materials.json`
- `source-map.json`
- `validation-report.json`
- `geometry/`

Do not include the staged Scott scene payload in the slim Cloudflare Pages deploy.

## Large Scene JSON Files And Hosted DXF

The real Scott DXF is 36.71 MiB, which is over the Cloudflare Pages 25 MiB single-file asset limit. The generated staged scene is also too large for Pages as static files: `source-map.json` and at least one geometry document exceed 25 MiB.

Current Cloudflare MVP:

- Deploy the static app shell.
- Keep local `Open DXF` available.
- Use a hosted DXF URL only after the file is approved for the selected access model.

If the project needs hosted demo data, use R2 or another approved storage origin behind Access, an authenticated proxy, or signed URLs. Public R2 bucket URLs are acceptable only for non-sensitive layouts.

Longer-term options:

- Split generated scene geometry into files below the Pages limit.
- Compress or binary-pack scene geometry.
- Host generated scene assets from protected R2 instead of Pages.
- Keep local static scene loading for development.

## Rollback

If a bad deploy ships:

1. In the Cloudflare Pages dashboard, open the project -> Deployments tab.
2. Find the last known-good deployment.
3. Use the deployment menu to roll back or promote that deployment.
4. Cloudflare will re-promote that build to production without a rebuild.

Alternatively, revert the offending commit on `main` and push; Cloudflare will trigger a new build.
