# architecture-check false hits — ledger

Branch `fix/architecture-check-false-hits`, cut from origin/master 039249c, in the main checkout.
Bounded change, design agreed in chat (2026-10-15): the user picked "B — fix the skill only and
keep the deferral" over converting it to an agent (ADR-023's rejected option), and ruled the
broadcaster imports in API routes an accepted pattern.

## Rulings
- architecture-check stays a skill. The deferral's premise ("no recorded run on real diffs")
  still holds: this was a whole-tree run. Noted under ADR-023's Rejected list.
- API routes importing `@infrastructure/realtime/broadcast-*` are accepted → ADR-024, and
  CLAUDE.md's layer exceptions go from one to two.

## Run 1 — the skill as it was, by hand, whole `src/` at 039249c
Each check run with the Bash tool's `grep` (bundled ugrep) and `command grep` (system); counts
identical in every row.
- Check 1 (5 greps), Check 2 entity/aggregate greps (4 + api entities), Check 3, Check 4
  `Prisma\.` in dtos, Check 5 (3 greps), Check 6 `as any`, Check 7 `params\.` in api: 0 each.
- Check 2 `from '@infrastructure/'` in `src/app/api/`: 11 lines, 9 files, all
  `@infrastructure/realtime/broadcast-*`.
- Check 4 `from '@infrastructure/'` in `src/application/`: 6 lines, all
  `src/application/services/factories.ts:1-6`.
- Check 6 `: any` 29, `<any>` 2: all under `src/infrastructure/database/prisma/generated/`
  (git-ignored; `git ls-files -oi --exclude-standard --directory src`). Bundled ugrep found them
  too: the ignoring `.gitignore` is at the repo root, above the `src/` start point.
- Sweep shape on a missing path: `grep -rn "from '@prisma/client'" src/nonexistent/ 2>/dev/null
  || echo "CLEAN"` printed `CLEAN`.

## Change (controller)
SKILL.md: "Accepted exceptions" list; Check 2 pipes out the broadcasters, Check 4 pipes out
`^src/application/services/factories.ts:`, Check 6 adds `--exclude-dir=generated`; the sweep drops
`2>/dev/null` and `|| echo "CLEAN"`, adds an infrastructure section with both exclusions and
`<any>`. Observed vs assumed rewritten; FINDINGS.md gets two entries (trap, refutation).

## Run 2 — the edited sweep, extracted with awk from SKILL.md and sourced in the Bash tool's shell
Three trees × two greps (`grep` = shell function → ugrep; a `sed` copy with `command grep`):
- Real tree: all five sections empty, both greps.
- Planted tree (scratchpad): `src/domain/x.ts` imports `@application/x`; `src/components/c.tsx`
  imports `@domain/entities/quiz` and has `: any`; `src/application/services/foo.ts` and
  `src/app/api/r/route.ts` line 2 import `@infrastructure/database/prisma/client`;
  `src/hooks/h.ts` imports `@prisma/client`. Exceptions planted beside them:
  `src/application/services/factories.ts` (infra import), route.ts line 1 (broadcaster),
  `src/infrastructure/database/prisma/generated/g.ts` (`: any`). Output: exactly the 6 violation
  lines, none of the 3 exceptions, both greps.
- Same tree with `src/domain/` moved away: `ugrep: warning: src/domain/: No such file or
  directory` / `grep: src/domain/: No such file or directory` under the domain heading; the other
  sections as in the planted tree.
- Corrected single-check forms on the real tree (Checks 2, 4, 6): 0 each, both greps.

## Review (task-reviewer, dispatched without a model; its file pins sonnet)
CHANGES_REQUESTED: 1 important, 3 minor. Tamper check clean (HEAD 039249c, same porcelain
status, sha256 of the four changed files and this ledger unchanged).
- Important, verified by the controller: Run 1 skipped Check 7's second grep
  (`params\.` in `src/app/` `.tsx`). It returns 1 line with both greps:
  `src/app/(admin)/admin/quizzes/[quizId]/page.tsx:21`, a `'use client'` page using
  `useParams()`. The Observed claim "every grep in Checks 1-7 is empty" was false. Fixed in the
  Observed bullet and the refutation entry; Check 7 gets a `useParams()` note.
- Minor, verified: presentation infrastructure imports are only checked in `src/app/api/`;
  8 lines in 6 files outside it (controller re-ran the grep). Recorded as a gap entry and under
  Assumed; whether they are violations is open for the user. Not fixed: out of scope, needs a
  ruling.
- Minor: "48" = 11 + 6 + 31 confirmed; the unescaped `.` in the factories filter is harmless.
  No change.
- The reviewer re-ran the planted and missing-domain sweeps (system grep only), the ADR-024
  counts (11 lines, 9 files, 12e4e32 2025-12-08) and the advance route order: all as recorded.

Re-review (same agent, resumed): APPROVED, 4 minor. It confirmed the 8 lines / 6 files list, the
`page.tsx` lines 1, 3 and 20-21, and ran the Check 5 `../../application/` grep (0), which
completes "Checks 1-6". Applied: the gap entry's "Ran" wording; this section's heading. Not
changed: the Check 7 `useParams()` note rests on Next's docs, not a run (it is reading guidance,
not an Observed claim). Tamper check clean after both rounds.

## Not verified
- The individual Checks 1-7 against the planted tree (only the sweep ran there).
- Any run on a single diff.

No code changed: no `yarn test:run` (markdown and skill files only).

## PR
PR text approved by the user 2026-10-15; opened PR #76 (https://github.com/Banych/bobrquiz/pull/76) with the exact approved body. Merge and the PROGRESS work index line wait for the user.
