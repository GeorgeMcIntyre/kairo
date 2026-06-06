# Deploy Cloudflare

Last updated: 2026-06-06

Use this as the short operational checklist. See `specs/KAIRO_CLOUDFLARE_DEPLOYMENT.md` for security, Access, rollback, and future R2/D1 notes.

## Local Verification

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

The Cloudflare build must not include `apps/viewer/dist/scenes`. Local staged Scott scene assets are development-only because the generated source-map and at least one geometry document are too large for Pages static upload.

## Pages Settings

| Setting | Value |
|---|---|
| Project | `kairo-viewer` |
| Root directory | repo root / blank |
| Framework preset | None / manual |
| Build command | `pnpm run build:cloudflare` |
| Build output directory | `apps/viewer/dist` |
| Node | `NODE_VERSION=20` |
| pnpm | `PNPM_VERSION=10.17.0` |

## Direct Upload Fallback

```powershell
pnpm dlx wrangler pages deploy apps/viewer/dist --project-name kairo-viewer
```

Use direct upload only after the local verification commands pass.

## Scott Sharing

Do not deploy the staged Scott scene payload to Pages. Create a portable package instead:

```powershell
node packages\cli\dist\index.js pack-scene apps\viewer\public\scenes\scott-dxf2013-import tmp\scott-dxf2013-import.kairo
node packages\cli\dist\index.js validate tmp\scott-dxf2013-import.kairo --json
```

2026-06-06 result: valid package, 9,884,877 bytes, 29 nodes, 28 geometry documents, 0 validation findings.
