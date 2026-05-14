# Kairo Work Handover - 2026-05-14

## Clean Branch To Use

Use this clean integration worktree at work:

```text
C:\Users\George\source\repos\kairo-worktrees\kairo-issue019-integrate
```

Branch:

```text
codex/kairo-viewer-semantics-integrated
```

Do not use the dirty main checkout for certification:

```text
C:\Users\George\source\repos\kairo
```

## Latest Integrated Work

Remote base:

```text
5a4ebb2 Add Kairo package support and viewer diagnostics
```

Integrated ISSUE-019 commit equivalent:

```text
7bbd082 feat: add Scott semantic QA diagnostics
```

The cherry-pick had documentation conflicts in:

```text
specs/KAIRO_STATUS.md
specs/KAIRO_TASKS.md
specs/NEXT_PHASE_RECOMMENDATION.md
```

Resolution kept the conservative product state:

- ISSUE-019 is QA support ready / manual review pending.
- ISSUE-018 remains blocked/gated until manual semantic QA is recorded.
- POC readiness remains about 89%, not 92%.
- Required Scott meanings remain protected:
  - `7B-020L-04` = robot/device number, not station
  - `7B-070L-DN1` = dunnage station
  - `7B-070L-DN2` = dunnage station
  - `7B-060L-1N` = nest

## Verification

Run in:

```text
C:\Users\George\source\repos\kairo-worktrees\kairo-issue019-integrate
```

Results:

```text
pnpm.cmd install --frozen-lockfile
pnpm.cmd test -- --minWorkers=1 --maxWorkers=1   -> 281/281 passed
pnpm.cmd typecheck                               -> passed
pnpm.cmd build                                   -> passed
```

Known acceptable warning:

```text
Vite viewer chunk-size warning only
```

## Branch State

Push target:

```text
origin/codex/kairo-viewer-semantics-integrated
```

This branch should be final-reviewed before it replaces or updates:

```text
origin/codex/kairo-viewer-semantics
```

## Worktrees To Avoid

Avoid using the dirty main checkout for review, certification, or deploy:

```text
C:\Users\George\source\repos\kairo
```

Known dirty/mixed work in the main checkout includes staged/unstaged changes and unrelated untracked local files. Do not reset, clean, stash, or force-push from that checkout unless explicitly planned.

Other worktrees may contain branch-specific work and should not be treated as the final review target unless explicitly selected.

## Recommended Next Sequence

1. Final review of `codex/kairo-viewer-semantics-integrated`.
2. Manual Scott semantic QA using `specs/investigations/SCOTT_SEMANTIC_QA_RUNBOOK.md`.
3. Record PASS, PARTIAL, or FAIL in the findings/checklist.
4. Only after that decision, start persistence or block-instance extraction in a separate worktree.

## Do Not Touch Yet

- Do not deploy.
- Do not force push.
- Do not use the dirty main checkout for certification.
- Do not start ISSUE-018 persistence until ISSUE-019 manual QA is recorded.
- Do not start block-instance extraction in this integration branch.
