# ISSUE-022 Compact Viewer UI

Last updated: 2026-05-13

## Goal

Make the drawing viewport dominate the Kairo viewer while keeping existing inspection, layer, semantic, and diagnostics tools available.

## Scope

Changed only viewer layout and density:

- Compact top toolbar.
- Smaller left layer drawer.
- Smaller right inspector drawer.
- Semantic validation panel moved out of the central drawing area.
- Diagnostics panel constrained as a bottom drawer.
- Persistent bottom status strip for selection, layer, view mode, viewport size, zoom, and outlier visibility.

## Non-goals

- No semantic logic changes.
- No DXF parser changes.
- No source DXF rewrites.
- No new quote, foundation, transform, or move-tool features.
- No full product redesign.

## Expected Behavior

- Center drawing area stays mostly clear.
- Layers, inspector, semantics, and diagnostics remain accessible through the existing toolbar buttons.
- Inspector and semantic details are still available, but no longer dominate the viewport.
- The compact status strip gives quick context without opening the diagnostics panel.

## Known Limits

- Panels are still overlay drawers rather than a fully docked/resizable workspace.
- On narrow screens, multiple open drawers can stack vertically and should be opened one at a time for best visibility.
- Diagnostics remains a dense technical panel intended for debugging, not normal drawing review.

## Verification

Run:

```text
pnpm.cmd test -- --minWorkers=1 --maxWorkers=1
pnpm.cmd typecheck
pnpm.cmd build
```
