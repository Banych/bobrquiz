# Fix-wave re-review — c17cb16..488fb29

**Reviewer:** task-reviewer-capable (opus pin), read-only, handed back; saved by the main
session 2026-10-15. Tamper check clean (HEAD 488fb29 at start and end, status empty, ledger
listing unchanged).

## Verdict

CHANGES_REQUIRED: one Minor (N1). Every finding ruled "fix" is ADDRESSED except M5, which is
addressed in part.

- **ADDRESSED:**
  - I1: INDEX :80, :94, :124, :164–165; all targets exist.
  - M2: the session: line is gone; the realtime path is real; leaderboard:update is used in
    broadcast-leaderboard.ts and use-host-quiz-state.ts; repository files are kebab-case.
  - M3: there is no `yarn test` left in the commands.
  - M4: the player and question save() calls upsert. The quiz aggregate's save() calls update
    (:144–145), with create at :221 and update at :239.
  - M6: schema output is ./generated/client, ignored by .gitignore:31; generated-client.ts is
    tracked.
  - M7.
  - M8, for the two lines this branch set. PR #7 is right: c7ccd32 is not on master's
    first-parent line, and the first first-parent merge that contains it is 3dc47e0 (PR #7,
    2026-03-07).
  - M9.
  - M10: the #63 ledger files stay tracked; `git add -f` of an explicit path works (reasoned,
    not run).
  - M12.
  - M13, the ruled parts.
  - C1: plan.md:36 agrees with PROGRESS.md:17 and plan.md:325.
  - C2: ESLint reports check-links.mjs as ignored.
- **ADDRESSED IN PART:** M5, see N1.

## New problems

**N1 (Minor).** CLAUDE.md:41–42 says only API routes call `getServices()`. Four server-component
pages also call it:
- `src/app/(host)/host/page.tsx:1,23`
- `src/app/(host)/quiz/[quizId]/live/page.tsx:2,13`
- `src/app/(host)/quiz/[quizId]/page.tsx:2,13`
- `src/app/(player)/play/[quizId]/[playerId]/page.tsx:2,15`

Fix: "API routes and server-component pages call its `getServices()`."

## Out-of-scope observations

- **Link-check count.** The checker reports 48 occurrences in total. The 6 that are in neither
  the baseline nor links-after are example text in this plan's own file, which the acceptance
  command filters out on purpose (plan-check ruling). Not a regression.
- **INDEX.md:113** sends E2E readers to a frozen session file.
- **create-hook event list:**
  - It leaves out `player:kicked` (broadcast-player-events.ts:65).
  - The `leaderboard:update` line breaks the column alignment.
- **PROGRESS.md.** The new 2026-07-05 heading has a blank line after it; the sibling headings
  have none.
- **This branch's ledger** is not force-added yet (Step 8).

## Evidence (as reported)

- `git diff c17cb16 488fb29` is the same as the saved diff: 16 files, +40/−31.
- Attribution grep: none.
- `git diff --check`: exit 0.
- `yarn lint`: exit 0 (0 errors, 5 warnings).
- `yarn test:run`: exit 0, 65 passed | 1 skipped files, 466 passed | 1 skipped tests.
- 28 files under src/app import factories; 4 of them are non-API pages.
- First-parent merge loop for c7ccd32 → 3dc47e0.
- Every link target passes `test -e`.

## Unverified

- `git add -f` under `/.superpowers/` (reasoned, not run).
- Whether a dedicated R5 PR existed on GitHub.
