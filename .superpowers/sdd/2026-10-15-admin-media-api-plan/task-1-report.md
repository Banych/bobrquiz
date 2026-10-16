# Task 1 report: storage port, media DTOs, shared limits

## Status

DONE

## What I did

1. Step 1: wrote the two test files from the brief verbatim (`src/tests/application/dtos/media-dto.test.ts`, `src/tests/lib/image-utils.test.ts`). The directory `src/tests/application/dtos/` did not exist and was created.
2. Step 2 (RED): ran the two files; they failed on the missing exports, as the brief expects.
3. Step 3: created `src/application/ports/storage-service.ts` and `src/application/use-cases/media-validation-error.ts`; appended the media DTOs to `src/application/dtos/media.dto.ts` (kept `MediaFileDTOSchema`); changed `isValidImageType` and added `isWithinUploadLimit` in `src/lib/image-utils.ts` (added the `@application/dtos/media.dto` import at the top; `isValidImageSize` untouched); added ADR-025 before `## Open ideas (not decisions)` in `docs/DECISION-LOG.md`; added the Ports bullet after the Application bullet in `CLAUDE.md`.
4. Step 4 (GREEN): ran the two files; 2 files, 12 tests passed.
5. Step 5: `yarn eslint --fix` on the touched files, then `yarn eslint` without fix, then `yarn tsc --noEmit`. The fix pass changed no files (see Evidence). No package.json script covers a scoped eslint run or a type-check, so the brief's raw commands stand.
6. Step 6: staged exactly the brief's list and committed as `75631a2`. `.superpowers/` was not staged.
7. Full suite: `yarn test:run` (no pipe), 68 files passed / 1 skipped, 501 tests passed / 1 skipped, exit 0.
8. Self-review of `git show HEAD` against the brief: all items present, no extra files, no edits outside the brief's list.

## TDD evidence

RED command: `yarn test:run src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts` (run before any source change)

RED summary (verbatim):
```
 Test Files  2 failed (2)
      Tests  11 failed | 1 passed (12)
```
Representative failures:
```
TypeError: isWithinUploadLimit is not a function
AssertionError: expected undefined to deeply equal [ 'image/jpeg', 'image/png', …(2) ]
TypeError: Cannot read properties of undefined (reading 'parse')
TypeError: Cannot read properties of undefined (reading 'safeParse')
```
The one passing test was `accepts the four image types and nothing else`, which exercises the pre-existing type check and so passes before the change. Expected.

GREEN command: `yarn test:run src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts`

GREEN summary (verbatim):
```
 Test Files  2 passed (2)
      Tests  12 passed (12)
```

## Step 5 output

- `yarn eslint --fix src/application/ports src/application/dtos/media.dto.ts src/application/use-cases/media-validation-error.ts src/lib/image-utils.ts src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts`: exit 0, no lint output. Files changed by `--fix`: none. Evidence: the modification times of all six files are before the fix pass ran (see Evidence), so ESLint did not rewrite any of them.
- `yarn eslint <same paths>` (no fix): `Done in 1.25s.`, exit 0.
- `yarn tsc --noEmit`: `Done in 3.90s.`, exit 0.

## Files changed (commit 75631a2)

- `CLAUDE.md` (+2)
- `docs/DECISION-LOG.md` (+24, ADR-025)
- `src/application/dtos/media.dto.ts` (+28)
- `src/application/ports/storage-service.ts` (new)
- `src/application/use-cases/media-validation-error.ts` (new)
- `src/lib/image-utils.ts` (import added, `isValidImageType` rewritten, `isWithinUploadLimit` added)
- `src/tests/application/dtos/media-dto.test.ts` (new)
- `src/tests/lib/image-utils.test.ts` (new)

## Departures from the plan

- The first attempt to run the RED step was one compound Bash command (directory creation, two file writes, test run). The worktree guard refused it as too complex to verify it stays inside the worktree. I split it into separate commands and wrote the two test files with the Write tool. The file contents are exactly the brief's. Not a change to the plan.
- No other departures.

## Concerns and observations (no action taken)

- The ADR's References link `progress/plans/2026-10-15-admin-media-api-design.md` resolves: the file exists at `docs/progress/plans/2026-10-15-admin-media-api-design.md`.
- The `ide` MCP server failed to connect in this session. Not used by this task.

## Evidence

Commit and stat (`git show --stat HEAD`):
```
commit 75631a2ca0867bbc13bffddc1e087a70b1c36d0f
    feat(media): add storage port and media DTOs

 CLAUDE.md                                          |  2 ++
 docs/DECISION-LOG.md                               | 24 +++++++++++++
 src/application/dtos/media.dto.ts                  | 28 +++++++++++++++
 src/application/ports/storage-service.ts           | 23 +++++++++++++
 .../use-cases/media-validation-error.ts            |  7 ++++
 src/lib/image-utils.ts                             | 15 +++++---
 src/tests/application/dtos/media-dto.test.ts       | 40 ++++++++++++++++++++++
 src/tests/lib/image-utils.test.ts                  | 25 ++++++++++++++
 8 files changed, 160 insertions(+), 4 deletions(-)
```

Commit output: `[feat/admin-media-api 75631a2] feat(media): add storage port and media DTOs` / `8 files changed, 160 insertions(+), 4 deletions(-)`

Full suite (`yarn test:run`, no pipe), verbatim summary:
```
 Test Files  68 passed | 1 skipped (69)
      Tests  501 passed | 1 skipped (502)
   Start at  08:54:45
   Duration  1.52s (transform 2.08s, setup 0ms, import 3.86s, tests 1.47s, environment 13ms)
Done in 1.81s.
EXIT=0
```

Modification times (`stat -c '%y %n'`, taken after `--fix` ran; `date` printed `08:54:29`):
```
2026-10-16 08:54:03.896516272 +0100 src/application/ports/storage-service.ts
2026-10-16 08:54:04.054736882 +0100 src/application/use-cases/media-validation-error.ts
2026-10-16 08:54:09.785318660 +0100 src/application/dtos/media.dto.ts
2026-10-16 08:54:10.079258511 +0100 src/lib/image-utils.ts
2026-10-16 08:53:56.213393826 +0100 src/tests/application/dtos/media-dto.test.ts
2026-10-16 08:53:56.364016003 +0100 src/tests/lib/image-utils.test.ts
```

Tree after commit (`git status --porcelain`): only ` M .superpowers/sdd/2026-10-15-admin-media-api-plan/progress.md` remains, which is the controller's ledger and was not touched.

## Unverified

- Whether `yarn eslint --fix` changed any file: inferred from modification times, not from a diff against a pre-fix snapshot. The mtimes show no write after my own edits, so the inference holds for this run.
- The ADR link resolves by `ls`, not by rendering the Markdown.
