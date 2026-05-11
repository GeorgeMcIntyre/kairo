# Kairo Cloudflare Deployment

Last updated: 2026-05-10

This is the canonical deployment checklist for the Kairo viewer on Cloudflare Pages. The deployment target is the static Vite app in `apps/viewer`; exporter code, CAD Exchanger probe tools, importer code, and schema code are not part of the cloud runtime.

## Target

| Setting | Value |
|---|---|
| Cloudflare product | Pages |
| Project name | `kairo-viewer` |
| Frontend package | `@kairo/viewer` |
| App path | `apps/viewer` |
| Package manager | `pnpm@10.17.0` |
| Build command | `pnpm --filter @kairo/viewer build` |
| Output directory | `apps/viewer/dist` |
| SPA fallback | `apps/viewer/public/_redirects` copied to `apps/viewer/dist/_redirects` |
| Root config | `wrangler.toml` with `pages_build_output_dir = "apps/viewer/dist"` |

Cloudflare dashboard settings:

- Framework preset: `None` / manual config
- Root directory: blank / repo root
- Build command: `pnpm --filter @kairo/viewer build`
- Build output directory: `apps/viewer/dist`
- Environment variables:
  - `NODE_VERSION=20`
  - `PNPM_VERSION=10.17.0`

Only pushed commits deploy from Cloudflare's Git integration. Local commits ahead of `origin/main` are not visible to Cloudflare until pushed.

## Security And Access

Kairo must not be publicly reachable when it can reveal company layouts, source-map metadata, hosted DXF URLs, or generated scene assets.

Configure Cloudflare Zero Trust / Access before sharing any deployment:

| Access setting | Value |
|---|---|
| Application type | Self-hosted |
| Production hostname | `kairo-viewer.pages.dev` |
| Preview hostname | `*.kairo-viewer.pages.dev` |
| Policy action | Allow |
| Include rule | Approved email addresses or approved IdP team/group only |
| Default posture | Everyone else denied |

Setup checklist:

1. In Cloudflare Zero Trust, create an Access application for `kairo-viewer.pages.dev`.
2. Add `*.kairo-viewer.pages.dev` as an additional hostname or create a matching second Access application for preview deployments.
3. Add only approved emails, an approved email domain, or an approved identity-provider group/team.
4. Do not add public bypass rules.
5. If Kairo later gets a custom domain, add that hostname to the same Access policy before use.
6. Test in a private browser session before sharing the URL.

DXF and hosted asset rules:

- Do not expose company DXF files publicly.
- Do not use public R2 bucket URLs for sensitive layouts.
- Prefer an Access-protected domain, an authenticated proxy, or short-lived signed URLs.
- `VITE_KAIRO_DEMO_DXF_URL` may be used only with an approved protected or signed URL.
- The viewer must not hardcode public sensitive DXF URLs.
- Do not commit secrets, API tokens, account IDs, private URLs, signed URLs, or customer/company file paths.

## Local Commands

Install dependencies:

```powershell
pnpm install
```

Run local viewer dev server:

```powershell
pnpm --filter @kairo/viewer dev
```

Build production assets:

```powershell
pnpm --filter @kairo/viewer build
```

Full local verification:

```powershell
pnpm test -- --minWorkers=1 --maxWorkers=1
pnpm typecheck
pnpm build
```

Manual direct upload fallback:

```powershell
pnpm dlx wrangler pages deploy apps/viewer/dist --project-name kairo-viewer
```

The normal path should be Cloudflare Pages Git deploys from GitHub. Use direct upload only for controlled manual verification.

## Expected Build Output

After `pnpm build`, confirm:

```powershell
Test-Path apps\viewer\dist\index.html
Test-Path apps\viewer\dist\assets
Test-Path apps\viewer\dist\_redirects
Get-Content apps\viewer\dist\_redirects
```

Expected `_redirects` content:

```text
/* /index.html 200
```

The slim Cloudflare deploy should not include the Scott staged scene payload because several generated files exceed the Pages single-file asset limit. For local staged-scene development only, the expected demo scene payload is:

- `manifest.json`
- `scene.json`
- `layers.json`
- `materials.json`
- `source-map.json`
- `validation-report.json`
- `geometry/`

If the scene payload is missing, stage it before building:

```powershell
node packages/cli/dist/index.js stage-viewer-scene ".\tmp\scott-dxf2013-import" scott-dxf2013-import
```

There is no `stage` script in `apps/viewer/package.json`.

## Branch Deploy Strategy

- `main`: production deployment.
- Pull requests / feature branches: preview deployments.
- Do not depend on untracked local files or local build artifacts for cloud builds.
- Push only after `pnpm test -- --minWorkers=1 --maxWorkers=1`, `pnpm typecheck`, and `pnpm build` pass.

## Runtime Boundaries

The Pages runtime is static assets only:

- No production exporter dependency.
- No CAD Exchanger dependency.
- No `packages/exporter-glb` dependency.
- No `tools/glb-probes` dependency.
- No local absolute DXF path required during Cloudflare build.
- No auth implementation.
- No D1/R2 bindings yet.

The staged scene source-map may contain source path strings from local import metadata, but Cloudflare build must not require those paths to exist.

Access protection is handled by Cloudflare Zero Trust outside the viewer bundle. Do not treat client-side checks, hidden buttons, or unlisted URLs as security controls.

## Future D1 Plan

D1 is not part of the current deployment. Add it later only after a product requirement exists, such as saved review sessions, annotations, user-visible issue records, or shared layer presets.

Minimum future D1 plan:

- Add a schema/migration plan first.
- Add environment-specific D1 bindings in Cloudflare config.
- Keep static viewer deploy working without D1 for public demo mode unless auth/session features require otherwise.

## Future R2 Plan

R2 is not part of the current deployment. Add it later only if scene payload size or update workflow makes bundled static assets impractical.

Minimum future R2 plan:

- Move large scene JSON/geometry documents to R2.
- Keep `manifest.json` or a scene index small and CDN-cacheable.
- Document cache headers and invalidation.
- Preserve local static scene loading for development.
- For sensitive layouts, do not use public bucket URLs. Put R2 behind Access, an authenticated Worker/proxy, or signed URL issuance.
- If `VITE_KAIRO_DEMO_DXF_URL` is configured, verify the URL is approved for the data classification before deploying.

## Rollback

Cloudflare dashboard rollback:

1. Open Cloudflare Pages project `kairo-viewer`.
2. Go to **Deployments**.
3. Select the last known-good deployment.
4. Choose rollback/promote for that deployment.

Git rollback:

```powershell
git revert <bad-commit-sha>
git push origin main
```

Cloudflare will build the reverted `main` commit.

## Known Risks

- The Scott scene payload is large, especially `source-map.json`; cold loads may be slow.
- The Vite viewer bundle currently triggers a chunk-size warning.
- No auth exists; deploy only scenes intended for public/demo access.
- Cloudflare will not deploy local commits until pushed.
- Scene assets under `apps/viewer/public/scenes` are bundled into the Pages deploy.
- Future exporter/CAD Exchanger probe work is unrelated to this deployment path and must stay out of runtime dependencies.
