# Scott Semantic QA Machine Findings

Branch: `codex/kairo-viewer-semantics-integrated`  
Commit tested: `0f25eeb docs: add kairo morning handover`  
Scene: `apps/viewer/public/scenes/scott-dxf2013-import`

## Verdict

Machine QA = PARTIAL
Manual visual QA = completed after this machine run
ISSUE-018 = ungated after manual PASS

All four required labels were found and classified as the expected semantic kind. Geometry association was not fully accepted by machine checks because `7B-070L-DN1` and `7B-070L-DN2` are ambiguous and have no linked entity IDs. George later completed targeted manual visual QA and confirmed the intended DN1/DN2 dunnage geometry in `SCOTT_SEMANTIC_QA_MANUAL_FINDINGS.md`.

## Commands Run

```text
git status --short --branch
git log --oneline --decorate --max-count=8
pnpm.cmd install --frozen-lockfile
pnpm.cmd test -- --minWorkers=1 --maxWorkers=1
pnpm.cmd typecheck
pnpm.cmd build
node packages\cli\dist\index.js validate <local validated Scott scene>
node packages\cli\dist\index.js stage-viewer-scene <local validated Scott scene> scott-dxf2013-import
node packages\cli\dist\index.js validate apps\viewer\public\scenes\scott-dxf2013-import
pnpm.cmd test apps/viewer/src/semantic/scottSemanticQa.integration.test.ts -- --minWorkers=1 --maxWorkers=1
```

Baseline verification before the machine QA test passed: 281/281 tests, typecheck, and build. Final verification after the machine QA test passed: 283/283 tests, typecheck, and build. The build emitted only the expected Vite chunk-size warning. The local staged Scott scene validated with 0 errors and 0 warnings.

## Automated Test Added

`apps/viewer/src/semantic/scottSemanticQa.integration.test.ts`

The test loads the staged Scott scene through `loadPublicScenePackage`, runs `computeLayoutSemantics` with robust bounds, applies the viewer's effective semantic override step with no overrides, and builds `buildScottSemanticQaReport` in memory. It does not use Playwright, Puppeteer, browser automation, or visual checks.

The test also asserts deterministic Markdown export behavior, reviewer columns, automated risk marker coverage, and that the report Markdown omits local machine paths and timestamps.

## Required Label Results

| Label | Expected classification | Machine classification | associationStatus | linkedEntityCount | associationConfidence | candidateGroupIds | Result |
|---|---|---|---|---:|---:|---|---|
| `7B-020L-04` | `device_number`, not station | `device_number` | `linked` | 105 | 0.9565 | `insert-17583-fanuc-henrob-controller`; `insert-17700-fanuc-henrob-controller`; `insert-174ed-u36`; `insert-176e6-u36`; `insert-a3dc8-spr-cnt-tm-rip-concept-rh-rip` | PASS |
| `7B-070L-DN1` | `dunnage` | `dunnage` | `ambiguous` | 0 | 0.6800 | `insert-1713b-7g-080-1dr-2d`; `insert-1744e-210l`; `insert-1b2ea-rbrkt-2004-topview`; `insert-1b2eb-rbrkt-2001-topview`; `insert-1d8ac-u141` | PARTIAL |
| `7B-070L-DN2` | `dunnage` | `dunnage` | `ambiguous` | 0 | 0.6800 | `insert-17138-7g-080-1dr-2d`; `insert-1744e-210l`; `cluster-layer-0-a-annot-t-27-50`; `insert-1b2ea-rbrkt-2004-topview`; `insert-1b2eb-rbrkt-2001-topview` | PARTIAL |
| `7B-060L-1N` | `nest` | `nest` | `linked` | 3874 | 0.8705 | `insert-906ef-putdownstand`; `insert-1773a-7b060-spac`; `insert-1789d-7b-040-01n`; `insert-174dd-u36`; `insert-1744e-210l` | PASS |

## Scene Semantic Counts

| Metric | Count |
|---|---:|
| Stations | 14 |
| Devices | 116 |
| Linked devices | 36 |
| Ambiguous devices | 80 |
| Unlinked devices | 0 |
| Unknown labels | 948 |
| Required labels found | 4/4 |
| Required labels missing | 0 |
| Risk items | 177 |

## Risks

- `7B-070L-DN1` and `7B-070L-DN2` classify correctly as dunnage, but both are ambiguous and require visual review before they can be accepted as quote evidence or persistence input.
- The machine report found no missing required labels and no unlinked required labels.
- Automated association remains heuristic evidence only. It cannot prove that linked or candidate geometry visually matches the intended Scott layout equipment.
- Manual visual geometry confirmation is captured separately in `SCOTT_SEMANTIC_QA_MANUAL_FINDINGS.md`.

## Decision

Machine QA = PARTIAL
Manual visual QA = PASS
ISSUE-018 = ungated

The machine ambiguity remains useful metadata for persistence, but manual QA accepted the required dunnage associations as visually useful for this reviewed scene.
