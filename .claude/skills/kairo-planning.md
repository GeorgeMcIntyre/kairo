# Kairo Planning Skill

Use this for issue planning, task ordering, status updates, and deciding what not to do.

## Planning Sources

Read in this order:

1. `specs/KAIRO_TASKS.md`
2. `specs/KAIRO_STATUS.md`
3. Specific docs linked from the active task
4. `specs/ISSUE_BACKLOG.md` for older acceptance criteria

## Priority Rules

- Prefer unblocked work that advances the current five-goal path.
- Manual/browser/desktop gates must stay explicit; do not replace them with weaker static checks.
- Research probes should end in documented decision matrices, not production implementations.
- When a task becomes blocked, record the exact blocker and the next human/tool action.
- When a task is completed, move it to DONE with date, evidence, and verification.

## Allowed

- Split a large goal into scoped issues when the status files already support that shape.
- Add checklists and audit scripts when they make later verification concrete.
- Mark partial progress precisely.
- Preserve stop rules and not-allowed rules in task docs.

## Not Allowed

- Do not redefine a goal as complete because only manual checks remain.
- Do not promote baseline/generated review data to human-reviewed truth.
- Do not move parked JT/export work forward without probe results and explicit approval.
- Do not prioritize broad refactors over named task evidence.
- Do not use vague status like "mostly done" without listing remaining gates.

## Current Common Blockers

- Human review of 88 uncertain Scott first-review records.
- Browser/canvas smoke for Pages, `.kairo` upload, layer isolate, and drawing-first UI.
- CAD Exchanger/JT2Go/Process Simulate desktop bridge checks.
- Browser automation tool unavailable in the current Codex session.

## Completion Evidence

A task is done only when the relevant evidence exists:

- code/tests/build output for source tasks
- local CLI output for staged scenes/packages/probes
- committed docs for decisions and policies
- manual QA notes for visual/browser/CAD gates
- status/task files updated and pushed
