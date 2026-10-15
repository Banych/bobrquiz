# SDD ledger — plan: docs/progress/plans/2026-10-15-e2e-isolated-quizzes-plan.md

Spec: docs/progress/plans/2026-10-15-e2e-isolated-quizzes-design.md (approved 2026-10-15).
Plan approved by the user 2026-10-15, execution: subagent-driven, stop after each task.
Branch test/e2e-isolated-quizzes, worktree .claude/worktrees/test-e2e-isolated-quizzes, from master eddd33f.

## Plan check
Dispatched plan-checker at HEAD 5b289c9, git status clean.
Plan check returned DEFECTS (10). Tamper check: HEAD 5b289c9 and empty git status before and after (re-checked by the controller).
Verified by the controller: no file under src/infrastructure reads or writes answersLockedAt (grep); list-all-quizzes.use-case.ts:22 sets createdAt to new Date().

- Finding 1 (critical), lock never persisted: two round-transitions tests cannot pass. OPEN — asked the user (app fix in scope or not).
- Ruling: finding 2 (critical), list createdAt is the request time — the sweep reads the age from the title timestamp (new fixtureTimestamp, deviation 6), app untouched; the fake createdAt becomes a separate item — keeps this branch test-only — if wrong, the sweep moves to createdAt after an app fix, a one-function change.
- Ruling: finding 3, rules-of-hooks flags a fixture param named `use` — global constraint: name it `provide`, run eslint --fix on touched files — if wrong, lint fails in Task 1 and the review loop catches it.
- Ruling: finding 4, Task 1 count — now 11 passed (8 tests after the sweep test rework) — cheap.
- Ruling: finding 5, timer assertion passes while paused — toContainText(/remaining|elapsed/i) — cheap.
- Ruling: finding 6, error test timeout — 10_000 — cheap.
- Ruling: finding 7, 429 never shows in Playwright output — tee to scratch, grep 'Too many requests' in output and test-results — cheap.
- Ruling: finding 8, createAdminApi signature and title suffix — listed as deviation 7 — cheap.
- Ruling: finding 9, README step — add the lines, update the dependency sentence — cheap.
- Ruling: finding 10, printWidth 80 — eslint --fix on touched files before lint — cheap.
- Finding 1 decided by the user (2026-10-15): option B — fix the lock persistence on its own branch fix/persist-answer-lock (worktree .claude/worktrees/fix-persist-answer-lock, from origin/master d839d5f), in parallel. This branch's Task 2 lock tests and the final two full runs wait for that fix to merge.
- Plan fixes committed 7f1326f.
- Ruling: Task 1 acceptance runs against the dev server on :3000 started from the main checkout — Task 1 adds no app code and only calls the admin API, whose code is the same on master — if wrong, Task 1's run is repeated once the worktree server runs. Tasks 3 and 4 need the server from this worktree (asked the user).

## Task 1
BASE 7f1326f. Dispatched implementer.
Task 1 attempt 1: BLOCKED, nothing written — :3000 refused connections (the user had stopped the main checkout's server). The user's `yarn dev` in this worktree crashed: Turbopack (Next 16.3.8) "Symlink [project]/node_modules is invalid, it points out of the filesystem root". Replaced the node_modules symlink with `yarn install --frozen-lockfile --prefer-offline` (3.7 s, 1.1G) and ran `yarn prisma:generate`; next 16.3.8, @playwright/test 1.64.1. To record in a findings doc at the end of the branch: worktrees need a real node_modules for `yarn dev`.
Task 1 implementer DONE, commit 8c33aed; controller re-run: 11 passed, exit 0 (scratchpad task1-e2e.txt). Review dispatched at HEAD 8c33aed, status clean.
Task 1 review: APPROVED, spec all ✅, 6 minors. Tamper check clean (HEAD 8c33aed, status empty). ⚠️ items resolved by the controller: e2e/quiz-fixtures.spec.ts equals the plan's code after prettier (diff -w empty); server facts covered by the passing run and the plan check.
- Minors fixed in the task's own round (user rule): teardown deletes every quiz and throws once with all errors; cleanup-on-failure error logged with console.warn; reset accepts 404 (a racing sweep deleted it).
- Ruling: minor "quiz untracked while createTestQuiz is in flight at timeout" — no change; the stale sweep removes it after 30 minutes, tracking before creation needs a restructure for a rare case — if wrong, a timed-out run leaves a quiz for 30 minutes.
- Ruling: minor "JSON.parse(...) as T casts" — no change; the brief allows it and the shapes are pinned by the fixture tests — if wrong, a changed API shape fails in those tests instead of at the parse.
- Ruling: minor "sweep counts an already-gone quiz as deleted" — no change; matches the brief's 'already gone' wording, the count is only logged — cost: a log line can overcount under a race.
Task 1: fix round 1/5 (3 addressed, 0 open — teardown deletes all then throws AggregateError; cleanup failure console.warn; reset accepts 404; commits 8c33aed..22be611). Controller re-run 11 passed, exit 0. Re-review APPROVED; tamper check clean (HEAD 22be611, status empty). Controller confirmed the admin reset route maps "not found" to 404 (reset/route.ts:17-18).
- Re-review out-of-scope observation taken into Task 1 (user rule: fix minors in the task's own round): sweepFixtureQuizzes aborts on the first failed delete, which fails the cleanup project and so blocks every chromium test. Fix round 2 dispatched: try every delete, then throw once.
Task 1: fix round 2/5 (1 addressed, 0 open — sweep attempts every delete then throws AggregateError; commits 22be611..e851f5c). Controller re-run 11 passed, exit 0. Re-review ADDRESSED, no new breakage (1 minor: error text duplicated in AggregateError message and errors[] — no change, harmless). Tamper check clean (HEAD e851f5c, status empty).
Task 1: complete (commits 7f1326f..e851f5c, review clean)
Doc sweep after Task 1: design doc corrected (lock cause, createdAt) with a dated note; findings doc 2026-10-15-worktree-dev-server-node-modules.md (Turbopack symlink) written. Lock fix spec drafted on fix/persist-answer-lock, awaiting the user's approval.
