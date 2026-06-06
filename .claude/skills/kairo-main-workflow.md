# Kairo Main Workflow Skill

Use this when working on Kairo repo tasks, status tracking, or cross-cutting changes.

## Default Workflow

1. Read `specs/KAIRO_TASKS.md` and `specs/KAIRO_STATUS.md` before choosing work.
2. Treat `specs/ISSUE_BACKLOG.md` as historical context; prefer `KAIRO_TASKS.md` for current state.
3. Keep work scoped to the named issue or goal.
4. Update status/task docs when a task changes state or gains new verification evidence.
5. Commit only the intended files; leave unrelated local artifacts alone.

## Verification

Use the smallest verification set that proves the change:

- Docs-only: `git diff --check`
- TypeScript/source changes: `pnpm typecheck`, `pnpm test --run`
- Viewer changes: also run `pnpm --filter @kairo/viewer build`
- Cloudflare deploy path: `pnpm run build:cloudflare`
- Scene/package changes: use the relevant CLI `validate` command
- GLB probe changes: run the matching build and inspect scripts under `tools/glb-probes`

## Allowed

- Add focused docs, scripts, tests, and scoped source fixes.
- Use checked-in staged Scott scene data as the current integration fixture.
- Use `.kairo` packages for large scene sharing instead of Pages static scene assets.
- Record manual/browser/CAD blockers explicitly rather than claiming completion.

## Not Allowed

- Do not treat generated semantic associations as authoritative training truth without human review.
- Do not implement production GLB, JT, CAD Exchanger, or Cloudflare CAD conversion unless a task explicitly authorizes it.
- Do not delete or rewrite staged scene assets to make tests easier.
- Do not revert unrelated local changes or untracked artifacts.
- Do not mark a task done when the remaining gate is manual/browser/desktop and unverified.

## Current High-Risk Boundaries

- Scott first-review fixture is a baseline with 28 accepted and 88 uncertain records; it is not fully human-reviewed training truth.
- Public Pages build intentionally prunes staged Scott assets from `dist/scenes`; use `.kairo` package upload for Scott sharing.
- CAD Exchanger GLB/JT bridge probes are feasibility probes only.
- Browser/canvas QA remains manual until a working browser automation path exists.
