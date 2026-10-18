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

User go-ahead 2026-10-16 ("go both"): Task 3 next, ahead of Task 2 (Task 2's lock tests need fix/persist-answer-lock merged; Task 4 last because it deletes e2e/fixtures.ts, which the host specs import until Task 2).
- Ruling: task order 1, 3, 2, 4 — Task 3 shares no files with Task 2 — if wrong, a conflict shows in Task 4's full run.
## Task 3
BASE 21c1bbc. Dev server from this worktree confirmed. Dispatched implementer.
Task 3 implementer DONE, commit 0f3cdf4 (4 files). Controller: yarn lint exit 0, tsc exit 0; player specs --retries=0: 15 passed, exit 0; 'Too many requests' 0 in output, 0 files in test-results.
Task 3 review: APPROVED, spec all ✅, 3 minors. Tamper check clean (HEAD 3e93eaa, status empty). ⚠️ "retries twice (1 s, then 2 s)" resolved by the controller: confirmed by the plan check (use-host-quiz-players.ts:79-80, retry: 2).
- Minor fixed in the task's own round: the reconnection test "should detect offline state immediately on load" does not test a load-time offline state (its body is disconnect then reconnect) — renamed to what it checks.
- Ruling: minor "loose last-seen regexes (/just now|\ds ago/, /2m ago|3m ago/)" — no change; tolerances for timing drift between the mock time and the render — if wrong, a regression in last-seen formatting within those ranges goes unnoticed.
- Ruling: minor "fixed mock player ids p1/p2/p3" — no change; each page has its own route, so tests stay isolated — no cost.
Task 3 fix round 1 commit a732a9e (rename only, +3/-1 after prettier). Controller: reconnection spec --retries=0 8 passed, exit 0, 0 'Too many requests'.
Task 3: fix round 1/5 (1 addressed, 0 open — reconnection test renamed to 'should re-enable the answer box after the connection returns'; commits 3e93eaa..a732a9e). Re-review ADDRESSED, no new breakage; tamper check clean (HEAD f8a994a, status empty).
- Task 3: minor (deferred): 'should show reconnecting state during sync', 'should auto-reconnect when network returns' and the renamed test overlap heavily (offline → banner → online → box enabled). Deferred to the branch passes' simplification report — premise: the spec keeps the five existing reconnection tests and only moves them to their own quizzes; merging them is a test-design change outside Task 3. Reopen if the branch passes or the user want the suite trimmed.
Task 3: complete (commits 21c1bbc..a732a9e, review clean)
Doc sweep after Task 3: nothing measured or decided beyond the ledger lines above.

User go-ahead 2026-10-18 ("merge and go next"): fix/persist-answer-lock merged to master as PR #81 (dfcd22e), its follow-ups filed as #82–#89 and linked in PR #90 (e39a9e0). origin/master merged into this branch: 3469ebc, no conflicts. Controller: yarn test:run exit 0, Test Files 68 passed | 1 skipped (69), Tests 507 passed | 1 skipped (508).
- Premise discharged: Task 2 waited for the persisted answer lock; it is now on this branch.
## Task 2
BASE 3469ebc. Brief from task-brief. Waiting for the dev server on :3000 from this worktree.
Task 2 implementer DONE, commit 8088937 (2 files, plan code byte-identical). Implementer: 9 passed twice, exit 0, 0 'Too many requests'. Controller re-run: 9 passed (13.5s), exit 0, 0 'Too many requests' (output and test-results).
Task 2 review (task-reviewer): APPROVED, spec ✅, 2 minors. Tamper check clean (HEAD 946b875, status empty).
- Minor 1 fixed in the task's own round: the host-dashboard question-list check (`getByText(/capital of France/).first()`) also matches the Timer panel's active question, so it passes with no list; fix round 1 scopes it to the questions section and asserts both questions.
- Ruling: minor 2 "unanchored heading regexes (/timer/, /leaderboard/, /questions/, /players/, /Pending/)" — no change; a new heading containing the word fails loudly with a strict-mode violation rather than passing silently — cost: one locator edit when such a heading appears.
Fix round 1 dispatched (implementer).
Task 2 fix round 1 commit 279fe7b (1 file): question-list assertions scoped to page.locator('ol') (QuestionTimeline, the only <ol> in src), both question texts, no .first(). Implementer negative run (largestPlanet text altered): 1 failed | 4 passed, exit 1; positive 5 passed. Controller: host-dashboard + round-transitions --retries=0: 9 passed (11.6s), exit 0, 0 'Too many requests'.
Task 2 re-review: ADDRESSED; tamper check clean (HEAD 56e9a07, status empty).
- Ruling: minor "bare `ol` selector is coupled to QuestionTimeline being the only <ol> in src" — no change; no stable hook exists without a component change (outside this task), the spec comment documents the assumption, and a second <ol> keeps the check meaningful (text must still be found) — cost: one locator edit if a second list appears.
Task 2: fix round 1/5 (1 addressed, 0 open — question list scoped to the timeline, both questions asserted; commits 946b875..279fe7b).
Task 2: complete (commits 411d8c4..279fe7b, review clean)
Doc sweep after Task 2: the deferral premise "Task 2 waits for the persisted lock" discharged (PR #81); nothing measured beyond the runs above; the lock-fix findings' "Still to come" (round-transitions lock tests as the automated check) is now met on this branch — recorded here, the master doc updates when this branch merges.
## Task 4
BASE 5b309ba. Dispatched implementer.
Task 4 implementer DONE_WITH_CONCERNS, commit 7d5c7b9 (6 files). Departures: update test keeps a trailing timestamp on both titles (the brief's "<original> - Updated" ends without one, so fixtureTimestamp returned null and the sweep skipped it); fixtureTimestamp regex `\s(\d+)(?:-[^\s]+)?$` accepts a bare trailing number (read, not run); README prettier blank line reverted; untracked playwright/.quiz-info.json removed. Admin specs: 14 passed, exit 0. Full `yarn test:e2e --retries=0` twice: 1 failed (admin-auth.spec.ts:39 "should show error for invalid credentials"), 4 did not run, 43 passed, exit 1; 0 "Too many requests". One extra run also had 4 player-reconnection failures (waitForURL in joinAsPlayer), cause unknown, gone on rerun. lint, tsc exit 0.
Controller re-run admin specs: 14 passed (20.0s), exit 0, 0 "Too many requests".
- Cause found by the controller (t4-full.txt): strict-mode violation — getByText(/invalid login credentials/i) resolves to the form's error div and Next's dev overlay `#nextjs__container_errors_desc`, because login/page.tsx logs the expected auth failure with console.error; the overlay's presence at assertion time depends on timing (fails under parallel load, passed once alone).
- Ruling: fix in Task 4's fix round by scoping the assertion to the form (test-only) — the spec target is 0 failures, each with its own cause; the dev overlay is not what the test checks — cost if wrong: none to users; the app's console.error on a wrong password stays (dev-overlay noise only).
- Watch item for Task 5: the one-off player-reconnection waitForURL failures (no artefacts kept).
Task 4 review (task-reviewer): APPROVED, spec ✅, 2 minors + 1 observation. Tamper check clean (HEAD 874dd70, status empty). Reviewer ran the fixtureTimestamp regex on all four admin titles: each parses; 2 sweepable leftovers per run (create, update), as reported.
- Fixed in the task's own round: README "Test Structure" list omits five specs (pre-existing; same file as this task's README edit), and the admin-auth:39 form-scoped assertion (ruling above).
- Ruling: observation "admin-quiz-crud beforeAll opens a browser context it never closes" — no change; pre-existing, Playwright disposes contexts with the worker — cost: none observed.
Fix round 1 dispatched (implementer).
Task 4 fix round 1 commits f98c6ca (admin-auth invalid-login check scoped to `locator('form')`; no role=alert or test id exists) and 0175ca6 (README lists all specs). Implementer: admin-auth + player-join 11 passed, exit 0; admin-auth --repeat-each=3 20 passed, exit 0; negative (text altered) 1 failed | 2 passed, exit 1, restored. 0 "Too many requests" in every run.
Full `yarn test:e2e --retries=0` (6 workers, 59.7s): 5 failed, 3 did not run, 40 passed, exit 1 — admin-auth:145 stays on /login after sign-in; admin-quiz-crud:25 and admin-question-crud:95 dialogs still open after 5 s; host-dashboard:56 and player-connection-status:89 createQuiz POST /api/admin/quizzes timed out at 15 s. Earlier full runs today: 1 failed (the now-fixed admin-auth:39) / 43 passed, ~40 s.
- Systematic debugging, phase 1. Hypothesis to test (not a cause yet): server-side queueing under parallel load — the app's Prisma pool is max: 2 (prisma/client.ts), Playwright runs 6 workers, and every test now creates its quiz through the API. Investigation dispatched; no fix until the cause is measured.
- Incident: the fix-round implementer printed an admin session cookie from a Playwright request log into its transcript; it filtered the saved files afterwards. Reported to the user.
- Investigation (general-purpose, opus; tamper check clean, HEAD e164948): cause = Prisma pg pool max: 2 caps the dev server at ~43 statements/s (46 ms round trip per statement); fixture quizzes cost 26–41 statements each; a scratch pool of 2 reproduces the app's latency curve, a pool of 10 stays flat; DB, Supavisor, Auth and server CPU ruled out. admin-auth:145 (/login after sign-in) unexplained. 161 probe quizzes deleted (161 × 404). Findings: docs/progress/findings/2026-10-18-e2e-db-pool-queueing.md.
- Incident: a filled Password textbox line survived in a scratch error-context copy (keyword filter applied on read only); deleted from the scratch files (re-check: 0 files).
- Decision for the user: how to lift the ceiling (env-driven pool size in dev, fewer workers, or fewer round trips). Task 4 stays open until the full suite is green.
User choice 2026-10-18: env pool size, 10 in dev. Spec section 6 and plan Task 4b added (commit after 642e16d). Worktree .env.local is a symlink to the main checkout's; the controller wrote a worktree-only, git-ignored .env.development.local with DATABASE_POOL_MAX=10 instead of touching it.
- Ruling: no plan-checker pass for the one-task amendment — the task carries its full test code, and the per-task review covers it — cost if wrong: a plan defect surfaces in the review.
## Task 4b
Task 4b implementer DONE, commit ad06c3f (4 files). Red: module missing, 1 failed; green: 7 passed. Controller: yarn test:run exit 0, Test Files 69 passed | 1 skipped (70), Tests 514 passed | 1 skipped (515). Implementer: lint, tsc exit 0.
Task 4b review (task-reviewer): APPROVED, 2 minors. Tamper check clean (HEAD 30e1a62, status empty).
- Ruling: minor "no upper bound on DATABASE_POOL_MAX" — no code cap; .env.example now says to keep it well under the database's connection limit — a cap number would be a guess (Supavisor transaction mode multiplexes client connections; only 10 was measured), and an over-large value fails loudly as pooler errors, not silently — cost: a deliberate typo like 1000 on a dev box exhausts the pooler until fixed.
- Minor fixed: spec "No unit test for the helper" (meant the E2E fixture helper) named explicitly; .env.example's "200 limit" corrected to the measured 60 next to the new setting.
- Minor (no change): no '010' / '99999' test cases — '010' → 10 is harmless and the regex is pinned by the rejection cases.
Verdict run after the user restarted dev with DATABASE_POOL_MAX=10 (.env.development.local): full `yarn test:e2e --retries=0`: 48 passed (35.3s), exit 0, 0 "Too many requests" (output and test-results). admin-auth:145 (sign-in stayed on /login, unexplained by the pool) passed.
Task 4: complete (commits 5b309ba..0175ca6, review clean; full suite green after Task 4b)
Task 4b: complete (commit ad06c3f, review clean)
Doc sweep after Tasks 4 and 4b: findings 2026-10-18-e2e-db-pool-queueing.md (measured); spec section 6 and plan Task 4b (decision); .env.example documents DATABASE_POOL_MAX. Convention for CLAUDE.md "Commands"/pitfalls: E2E locally needs DATABASE_POOL_MAX≈10 — to add in Task 5's records with the E2E README.

## Task 5 (controller)
User go-ahead 2026-10-18 ("go"). Dev server with DATABASE_POOL_MAX=10.
- Full run 1 (default retries): 48 passed (27.9s), exit 0; 0 "Too many requests" in output and test-results.
- Full run 2, started right after: 4 flaky, 44 passed (59.1s), exit 0. Flaky: player-reconnection.spec.ts:80 auto-reconnect, :100 disable submission while offline, :117 reconnecting state during sync, :132 re-enable answer box. All four error contexts contain "Too many requests": the join limit (10 per 60 s per IP, in-memory fixed window, session-join route) — ~7 UI joins per run, run 1 took 28 s, so run 2's joins landed in the same window. The spec's section 5 recorded this risk to be handled only if a 429 appeared; it has. Earlier one-off reconnection waitForURL failures (Task 4) fit the same cause.
- yarn test:run exit 0, Test Files 69 passed | 1 skipped (70), Tests 514 passed | 1 skipped (515); lint exit 0 (5 warnings, untouched files); tsc exit 0.
- Fixture leftovers: 8 "E2E fixture" quizzes, all admin-quiz-crud and admin-quiz-updated (the two UI-created quizzes per run, 4 recent runs); the cleanup project sweeps them after 30 min, as designed. No fixture-created (createQuiz) leftovers.
- Old leftovers for the user's approval: 113 "Question CRUD Test…", 20 "E2E Test Quiz…", 20 "Update Test…" quizzes; 23 players on JOIN-KYTX ("Trivia Night Demo", Active): 18 "E2E-Setup…", 5 "E2E Reconnect…". Nothing deleted.
User choices 2026-10-18: (1) join limit from env, like the pool → spec section 7, plan Task 5b; worktree .env.development.local gains SESSION_JOIN_RATE_LIMIT=100. (2) Delete the old leftovers. (3) Security item: the user asked "with advisory?" — answered in the report; placement pending.
- Ruling: resolveRateLimit duplicates resolvePoolMax's six-line parse rather than sharing it — infrastructure cannot import src/lib and a shared module for two tiny helpers costs more than it saves — cost: a parse-rule change must be made twice.
Leftovers deleted (scratch t5-delete-leftovers.mjs, admin API): 153 quizzes (113 Question CRUD Test, 20 E2E Test Quiz, 20 Update Test), reset first when Active; re-read 153/153 → 404; 0 failures. 23 E2E players (18 E2E-Setup, 5 E2E Reconnect) removed from JOIN-KYTX "Trivia Night Demo" via DELETE /api/quiz/{id}/player/{playerId}; players left on it: 0. Quizzes in the dev DB after: 14 (8 of them recent sweepable admin-UI fixture quizzes).
## Task 5b
Task 5b implementer DONE, commit 78b7c75 (4 files). Red 8 failed | 7 passed (15); green 15 passed. One extra test: the bad value appears in the message. Controller: yarn test:run exit 0, Test Files 69 passed | 1 skipped (70), Tests 522 passed | 1 skipped (523); lint exit 0.
Task 5b review (task-reviewer): APPROVED, 3 minors. Tamper check clean (HEAD 90f62e8, status empty).
- Minor 1 fixed in the task's own round: the error names no variable (resolvePoolMax names DATABASE_POOL_MAX) — add a name argument so the message names SESSION_JOIN_RATE_LIMIT.
- Ruling: minor 2 "no route test for the default 10" — no change; the default is the literal at the call site plus the unit test of the fallback, and the diff shows nothing else in the route — cost: a future edit of the literal is caught only in review.
- Ruling: minor 3 "a huge digit string disables the limit" — no change; same as resolvePoolMax, and only a deliberate setting reaches it; .env.example forbids raising it in deployed environments.
Fix round 1 dispatched (implementer).
Task 5b fix round 1 commit f500d81 (resolveRateLimit gains a name argument; join route passes SESSION_JOIN_RATE_LIMIT; spec 7 and plan Task 5b updated). Red 1 failed | 14 passed; green 15 passed. Controller: yarn test:run exit 0, Test Files 69 passed | 1 skipped (70), Tests 522 passed | 1 skipped (523).
Task 5b re-review: ADDRESSED; tamper check clean (HEAD 666de9f, status empty). 2 minors fixed by the controller (docs): the fix round had wrongly given resolvePoolMax's plan comment a `name` (reverted to its text at c587793); spec 7 and the plan's route snippet re-wrapped to the docs' width. Also client.ts's comment "connection limit (200)" → 60 on the dev project (raised by the release-review session, bobrquiz-0d).
Task 5b: fix round 1/5 (1 addressed, 0 open — the error names SESSION_JOIN_RATE_LIMIT; commits c587793..f500d81).
Task 5b: complete (commits 589e1cf..f500d81, review clean)
- Security item (premise change): the user approved my advisory text ("Host quiz controls under /api/quiz/* need no login"), but before posting the controller listed the repo's advisories: the release-review session had already drafted GHSA-j2j8-j6g6-5f29 (critical, "Anyone can control any quiz: the host routes and host pages have no authentication") and GHSA-j6mg-7jc4-3gvf (player identity), and public #95 covers x-forwarded-for and per-instance limits. Not posted (duplicate); the item is discharged by those.
- Release-review session notice: a coming host/player credential change will alter /api/quiz/** contracts used by e2e/support/quiz-fixtures.ts (POST /api/quiz/start) and the player specs.
#107 comment posted 2026-10-18 on the user's "post the #107 comment" (pool measurements), text as shown.
Verdict runs after the user restarted dev with SESSION_JOIN_RATE_LIMIT=100 and DATABASE_POOL_MAX=10, HEAD f7d4115, default retries, back to back:
- run 1: 48 passed (33.1s), exit 0; run 2: 48 passed (26.9s), exit 0; no flaky, no failed; 0 "Too many requests" in output or test-results for both.
- yarn test:run exit 0, Test Files 69 passed | 1 skipped (70), Tests 522 passed | 1 skipped (523); lint exit 0; tsc exit 0.
- Fixture leftovers: 10, all admin-quiz-crud / admin-quiz-updated, ages 1–17 min (under the 30 min sweep age); the sweep logged "deleted 2 stale fixture quizzes" in final run 1 — the sweep works as designed.
- Records: e2e/README.md env section (DATABASE_POOL_MAX, SESSION_JOIN_RATE_LIMIT); CLAUDE.md pitfall 5 (E2E env values, worktree node_modules); persist-answer-lock findings "Still to come" marked met. Spec and plan stay "In progress" until the PR merges.
Task 5: complete. Next: end-of-branch passes (production code changed: pool-size, client.ts, rate-limit, join route, host player-card test id) — awaiting the user's go-ahead.

## End-of-branch passes
User go-ahead 2026-10-18 ("go"). Range e39a9e0..23140ab (merge base with origin/master, which this branch merged at 3469ebc, to Task 5's records). Production code changed (pool-size + client.ts, rate-limit + join route, host player-card test id): all three reports — whole-branch review (task-reviewer-capable, handback saved as final-whole-branch-review.md), silent-failure hunt (final-silent-failure-hunt.md), simplification (final-simplification.md, report only). Code diff saved as review-branch.diff (src, e2e, playwright.config.ts, .env.example, .gitignore).

### Branch-pass reports (2026-10-18)
All three returned with HEAD ecdad04, empty status, and only their own report files new in the ledger dir (the whole-branch review also wrote its `yarn test:run` log to the session scratchpad, outside the repo). Counts each reran: `yarn test:run` 522 passed | 1 skipped (523), exit 0; lint 0 errors / 5 warnings in untouched files; tsc exit 0. Whole-branch review: CHANGES_REQUESTED, minor only (W1–W7). Hunt: S1–S2 Medium, S3–S7 Low. Simplification: P1–P6, R1–R3 rejected.

| Finding (sources) | Ruling | Cost if wrong |
|---|---|---|
| Join 429/500 surfaces only as a 30 s `waitForURL` timeout (S1 part 1) | Fix: one `joinAsPlayer` in `e2e/support/` asserts the join response is 200, body in the message; both specs use it (absorbs P6) | A rate-limit or route regression again reads as "cause unknown" |
| Flaky tests exit 0 locally (W5, S1 part 2) | Fix: `failOnFlakyTests: true` (no CI workflow runs E2E; checked `.github/workflows/ci.yml`). Retries stay, so a flake is still reported as flaky, but the run exits 1 | A flake caught only by someone reading the summary |
| Pitfall 5 says "fails"; measured was flaky + exit 0 (S1 part 3) | Fix wording; with `failOnFlakyTests` it now does fail | Misleads the next diagnosis |
| Invalid-join-code test passes on any 500 (S2) | Fix: assert 404 and "was not found" (the use case's message) | Hides a crashed join route |
| Reconnection overlap: :100 ⊂ :56, :117 and :132 ⊂ :80; :117's name promises a state it never asserts (W3, P1, S7, Task 3 deferred) | Fix: delete :100, :117, :132; :80 gains the initial-enabled check and a name saying what it asserts (offline/online event re-enables answering). Overrides the spec's "keep the five existing tests": its premise was coverage, and every dropped assertion is in a kept test. Revisitable: test-only | Two lost tests that each assert nothing the kept ones don't |
| `localStorage.clear()` in `beforeEach` is redundant (P2) | Fix: fresh context per test; `grep -c quiz-game-player-session playwright/.auth/user.json` → 0 | One extra page load per test only |
| Sweep reads any trailing number as a timestamp (S4) | Fix: `/\s(\d{13})(?:-[a-z0-9]{4})?$/`, the two shapes the code writes; spec cases for "round 2" and a short suffix | A hand-made "E2E fixture … 2" quiz deleted every run |
| Sweep skips untimed titles silently (S5) | No change: keeping them is right, only hand-made titles have that shape, and they stay visible in the admin list | Untimed leaks pile up unnoticed |
| Misspelled/unloaded env var silently uses the default (S3) | No change: the join case now fails with the 429 body (S1); pool starvation shows as 15 s fixture timeouts, which the findings record names. A dev-only log line is production code for a dev aid | Time lost to a typo in an env file |
| "Throws at startup" is really "throws when the module first loads" (S6, uncertain) | Fix the spec wording (sections 6 and 7); no build run to settle when Next evaluates the modules | A reader expects a boot failure that may come on first request |
| Spec "no app code changes", plan "only the one data-testid" (W1) | Fix: dated notes pointing at §6–7 and Tasks 4b/5b | Stale claim |
| Plan's ledger path missing `-plan` (W2) | Fix | Dead path |
| Ledger line 36 implies the sweep no longer blocks (W4) | Fix: append a correction; blocking stays on purpose (loud over silent) | A reader thinks one bad stale quiz can't stop the suite |
| Dev overlay repeats error text → strict-mode violation (W6) | Fix: README Debugging Tips line | Same trap rediscovered |
| Findings record lacks the outcome (W7) | Fix: dated Outcome paragraph with the post-fix counts and the 429 measurement | Findings read as open |
| Unused `trueFalse`, `points`; exports used only in-file (P3) | Fix | — |
| Auth-file path in four places (P4) | Fix: `e2e/support/paths.ts` with `ADMIN_STORAGE_STATE` and `BASE_URL`, used by the config, `auth.setup.ts`, `admin-quiz-crud.spec.ts` and the fixture. Pre-existing `localhost:3000` literals in page objects and admin-auth left alone (outside the change) | — |
| Inline error-to-message ternaries (P5) | Fix: `errorMessage()` in the fixture | — |
| Share the two env-integer parsers (R1), merge fixture spec tests (R2), trim client.ts comment (R3) | Agree: no change (layer rule; distinct behaviours; accurate) | — |
| Deferred minors triage (whole-branch review table) | All "fine as ruled" except the reconnection overlap, fixed above | — |

Fix wave on `2026-10-15-e2e-isolated-quizzes-plan-final-fixes`, cut from ecdad04.
- Correction (2026-10-18, whole-branch review W4) to Task 1's fix round 2 above: the sweep still throws one AggregateError after trying every delete, so the cleanup project still fails and chromium still does not run when a stale fixture cannot be deleted. Kept on purpose: loud over silent; the error names every quiz that failed.

### Fix wave (2026-10-18), commits e87b547..746cc4e on 2026-10-15-e2e-isolated-quizzes-plan-final-fixes
- eaf8fbb join response asserted (S1 part 1, S2, P6, P2 for player-join): player-join + reconnection --retries=0, 10 passed, exit 0.
- 368e543 reconnection overlap dropped, failOnFlakyTests (W3, P1, S7, P2, W5, S1 parts 2–3): reconnection --retries=0, 4 passed, exit 0. Negative case: a scratch probe test failing on attempt 0 and passing on retry gave "1 flaky", exit 1; the probe file was removed (status clean after).
- 8ed0f17 sweep regex (S4): new cases failed first ("received 2"), then quiz-fixtures.spec.ts 10 passed, exit 0.
- 2d17e20 paths module, dead code, errorMessage (P3, P4, P5): two full runs back to back, default retries + failOnFlakyTests: 45 passed each (24.2 s, 26.0 s), 0 flaky, exit 0. 45 = the earlier 48 less the three dropped tests.
- 2c445e3 docs (W1, W2, W6, W7, S6) and the W4 ledger correction.
- 746cc4e prettier fix in quiz-fixtures.spec.ts: missed in 8ed0f17 because only the edited support file was linted; caught by the full `yarn lint`.
- After the wave: `yarn test:run` Test Files 69 passed | 1 skipped (70), Tests 522 passed | 1 skipped (523), exit 0; `yarn lint` 0 errors / 5 warnings (untouched files), exit 0; tsc exit 0. Dev server: this worktree, pid cwd checked.

### Fix-wave re-review (2026-10-18), final-fixwave-rereview.md
task-reviewer-capable over ecdad04..6ce5372: CHANGES_REQUESTED, minor only; every ruling addressed. Tamper check clean (HEAD 6ce5372, empty status, ledger listing unchanged). Note: the reconnection merge kept the old :132 test (renamed) and gave it :80's "send answer" check, the reverse of the ruling's wording; same assertions.
| Finding | Ruling | Commit |
|---|---|---|
| R1 fixture title shape untested against the sweep | Fix: create test asserts `fixtureTimestamp(quiz.title)` not null | 6dd3ab0 |
| R2 spec lists the dropped true/false preset | Fix: dated note | 37519e6 |
| R3 join helper reads the body on success | Fix: body read only when status ≠ 200 | 6dd3ab0 |
| R4 invalid-code text unscoped | Fix: scoped to the form | 6dd3ab0 |
| R5 two wide doc lines | Fix: rewrapped | 37519e6 |
| R6 spec §6 "first request that reaches the database" | Fix: first request to a route that imports the services factory | 37519e6 |
Verification: quiz-fixtures + player-join + player-reconnection `--retries=0`: 15 passed, exit 0; lint and tsc exit 0 on the touched files.
Final verification at 37519e6, dev server from this worktree: full `yarn test:e2e` (default retries, failOnFlakyTests): 45 passed (24.2 s), 0 flaky, exit 0; `yarn test:run` Test Files 69 passed | 1 skipped (70), Tests 522 passed | 1 skipped (523), exit 0; `yarn lint` 0 errors / 5 warnings (untouched files), exit 0.
Doc sweep: decisions — none outlive the work (failOnFlakyTests is in e2e/README.md and CLAUDE.md pitfall 5); findings — pool findings "Outcome" added; conventions — README debugging tip 5 (dev overlay), flaky tip; CLAUDE.md pitfall 5 updated. Branch-passes skill FINDINGS.md entry (first run outside Bedtime Bloopers) offered to the user: it lives in ~/.claude.
Fix branch not merged into test/e2e-isolated-quizzes yet: waits for the user's go-ahead.
