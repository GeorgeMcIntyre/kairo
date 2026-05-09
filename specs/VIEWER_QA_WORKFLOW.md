# Viewer QA Workflow

Last updated: 2026-05-09

Repeatable manual QA workflow for importing a DXF file and inspecting it in the viewer.

---

## Prerequisites

- Node.js and pnpm installed.
- Repo built: `pnpm build` succeeds.
- DXF file available locally.

---

## Standard Commands (run in order)

### 1. Verify baseline

```
pnpm test
pnpm typecheck
pnpm build
```

All must pass before importing.

### 2. Import DXF

```
node packages/cli/dist/index.js import-dxf "C:\Users\George\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf" ".\tmp\scott-dxf2013-import"
```

Check output:
- No ERROR lines.
- Warning lines are expected (unsupported entities). Note the counts.
- `Kairo scene written` confirmation.

### 3. Validate scene

```
node packages/cli/dist/index.js validate ".\tmp\scott-dxf2013-import"
```

Expected: zero validation errors. Warnings are acceptable if documented.

### 4. Stage scene for viewer

```
node packages/cli/dist/index.js stage-viewer-scene ".\tmp\scott-dxf2013-import" scott-dxf2013-import
```

### 5. Start viewer dev server

```
pnpm --filter @kairo/viewer dev
```

### 6. Open in browser

```
http://localhost:5173/?scene=scott-dxf2013-import
```

---

## Manual Checklist

Work through each item. Note any failures.

| # | Check | Pass / Fail / Notes |
|---|---|---|
| 1 | Scene loads without blank screen | |
| 2 | Validation shows zero errors in diagnostics panel | |
| 3 | Fit scene button works — geometry fills viewport | |
| 4 | Top-2D view shows layout flat without Z distortion | |
| 5 | Lines are visible at normal zoom | |
| 6 | Scene tree is usable — nodes expand | |
| 7 | Layer list shows expected layers with entity counts | |
| 8 | Selecting a node highlights it in viewport | |
| 9 | Source path is displayed for selected node | |
| 10 | Pan and zoom feel usable for large layout | |
| 11 | No console errors (open browser DevTools > Console) | |
| 12 | Browser performance is acceptable (no freeze on load) | |

---

## Expected Observations and Diagnosis

| Observation | Likely Cause |
|---|---|
| Some symbols are missing or wrong shape | Rotation/nested INSERT/text not yet supported |
| Layout appears tiny or hard to inspect | Viewer fit or camera ergonomics issue |
| Browser freezes or is very slow | Render batching / geometry count issue |
| Wrong layer assignments | Importer layer inheritance bug |
| Source path shows wrong DXF file | Source-map path issue |
| Validation errors appear | Schema or importer regression |

---

## After QA

If QA passes: update `specs/KAIRO_STATUS.md` with a signed-off QA note and proceed to TASK-003.  
If QA fails: file a note in `specs/KAIRO_TASKS.md` under NOW with the specific failure before any code changes.

---

## Quick Stats Command (once TASK-004 is implemented)

```
node packages/cli/dist/index.js scene-stats ".\tmp\scott-dxf2013-import"
```

Expected output: node count, layer count, geometry document count, curve entity count, mesh count, bounds min/max, largest extent.
