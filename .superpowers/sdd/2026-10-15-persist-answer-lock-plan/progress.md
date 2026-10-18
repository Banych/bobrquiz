# SDD ledger — plan: docs/progress/plans/2026-10-15-persist-answer-lock-plan.md

Spec: docs/progress/plans/2026-10-15-persist-answer-lock-design.md (approved by the user 2026-10-15; option B chosen by the user for finding 1 of the e2e plan check).
Root cause: root-cause-report.md (read-only opus investigation, worktree unchanged d839d5f before and after).
Branch fix/persist-answer-lock, worktree .claude/worktrees/fix-persist-answer-lock, from origin/master d839d5f.
- Ruling: reset clears locks before save (spec Design 5 amended) — after-save clear failing would leave a Pending quiz with a stale lock that reset cannot retry — if wrong, a failed save leaves locks cleared on a still-Active quiz, the host relocks.
- Ruling: tasks go to implementer (sonnet) with task-reviewer-capable reviews — the concurrency design is fixed in the spec, the code is two updateMany calls; the review carries the risk — if wrong, escalate the fix round to implementer-capable.

## Plan check
Dispatched plan-checker at HEAD 9c8377d, git status 0 lines.
Plan check returned READY (no blocking defects, 7 corrections). Tamper check: HEAD 9c8377d and empty status before and after (re-checked by the controller).
- Ruling: focus 4 not pinned (existing mapping records lack the key) — add `answersLockedAt: null` to both records — cheap.
- Ruling: lost-race test failed pre-fix on a TypeError, not "resolves" — stub listByQuizId; also built with an audit mock and asserts no audit save (spec: a lost race writes no audit row) — cheap.
- Ruling: Step 2 reset wording — only the save test fails pre-fix, the two not-called assertions are regression guards — cheap.
- Ruling: focus 1 pin — the stale-aggregate integration test, not the submit test — cheap.
- Ruling: spec said "mocks elsewhere get the methods" — amended: only lock and reset mocks, the rest are cast `as unknown as` — if wrong, tsc fails and the implementer adds them.
- Ruling: Task 3 records — findings record, E2E lock tests as the later automated check, status lines — cheap.
- Implementer note carried in the plan: answersLockedAt is Date | undefined; follow the file's `!` precedent at :180.
- Spec and plan status: In progress.
Paused for the user after the plan check (user, 2026-10-15: "pause after plan checker back").

User go-ahead 2026-10-16 ("go both"): lock Task 1 and E2E Task 3 in parallel.
## Task 1
BASE b1d804a. Dispatched implementer.
Task 1 implementer DONE, commit 4590411 (4 files). Controller verdict: yarn test:run exit 0, Test Files 66 passed | 1 skipped (67), Tests 493 passed | 1 skipped (494); the skip is the env-gated add-player.integration.test.ts (describe.skip unless enabled), pre-existing.
Controller mutation check: mapper changed to pass null through → 'maps a quiz record into an aggregate' fails (1 failed | 14 passed); file restored (git diff empty).
Task 1 review (task-reviewer-capable): APPROVED, spec ✅, 2 minors. Tamper check clean (HEAD 70ec8f3, status empty). ⚠️ "package differs byte-for-byte from git diff" — reviewer confirmed changed lines identical and reviewed the real commit; resolved.
- Ruling: minor 1 "a lock can survive a reset" (lock request loads Active quiz, reset clears, late lockQuestion writes) — accepted as real; Task 2 now also clears locks in StartQuizUseCase before save (plan Task 2 and spec Design 6 amended, integration test "clears a lock written after a reset when the quiz starts again" added) — a quiz starts only from Pending, so the clear is always right; cost if wrong: one extra updateMany per start.
- Ruling: minor 2 "updateMany bumps Question.updatedAt on every reset/start" — no change; only the admin question GET returns it, no UI shows it; narrowing to locked rows conflicts with the binding { quizId } filter — cost: updatedAt moves on restart.
- Unverified "one wins" relies on Postgres re-checking the condition in one UPDATE — added to Task 3's real-target check: two parallel lock requests → one 200, one 400, one snapshot set.
Task 1: complete (commits b1d804a..4590411, review clean)
Doc sweep after Task 1: nothing measured; plan and spec amended above (premise: the reviewer's lock-vs-reset interleaving).

User go-ahead 2026-10-16 ("go next").
## Task 2
BASE 3520bc4. Dispatched implementer.
Task 2 implementer DONE, commit a244b8c (7 files). Implementer red run: 9 failed | 15 passed (24) on the four files, as the brief predicted; fake ran unchanged. Controller verdict: yarn test:run exit 0, Test Files 67 passed | 1 skipped (68), Tests 501 passed | 1 skipped (502).
Task 2 review (task-reviewer-capable): APPROVED, spec ✅, 6 minors. Tamper check clean (HEAD ed0fcbe, status empty).
- Minors 2-5 fixed in the task's own round: integration test for two parallel locks (Promise.all) exercising the repository's false path; assert the late lockQuestion returns true; assert q1 is locked before the reset and the question count; unit test that start from a non-Pending quiz calls neither clearQuestionLocks nor save.
- Ruling: minor 1 "a failure after the lock is persisted leaves the round without a summary and a retry is refused" — recorded in the spec's Out of scope, no code change; it follows from Design 4 (persist first so a lost race writes nothing), undoing it needs a per-question unlock — cost: on a rare DB failure mid-lock, the host loses that round's summary.
- Ruling: minor 6 "closes that window overstates" — spec Design 6 reworded to "narrows" with the remaining interleaving — no cost.
Task 2 fix round 1 commit 5eedda5 (tests only, 2 files). Controller: yarn test:run exit 0, Test Files 67 passed | 1 skipped (68), Tests 503 passed | 1 skipped (504).
Task 2: fix round 1/5 (4 addressed, 0 open — parallel-lock integration test reaching the false path, late lock asserted, reset test non-vacuous, start-from-non-Pending guard; commits 2d00fd8..5eedda5). Re-review APPROVED; tamper check clean (HEAD 574ae9f). New minor in the fix diff: lockQuestion spy restored only on the last line — fix round 2 (try/finally).
Task 2 fix round 2 commit 5e3d72a (try/finally around the spy; 1 test file). Controller: yarn test:run exit 0, Test Files 67 passed | 1 skipped (68), Tests 503 passed | 1 skipped (504).
Task 2: fix round 2/5 (1 addressed, 0 open — spy restored in finally; commits 574ae9f..5e3d72a). Re-review ADDRESSED, no new breakage; tamper check clean (HEAD f80f352, status empty).
Task 2: complete (commits 3520bc4..5e3d72a, review clean)
Doc sweep after Task 2: spec amended during the task (out-of-scope item for a failure after the persisted lock; Design 6 "narrows"); nothing measured. Next: Task 3 (real-target check, controller) awaits the user's go-ahead.

## Task 3 (controller)
User go-ahead 2026-10-16 (dev server on :3001 from this worktree after a real node_modules install: yarn install --frozen-lockfile --prefer-offline, 4.0 s).
Verdict at 06e242f (from Task 2): yarn test:run exit 0, 503 passed | 1 skipped (504); lint and tsc exit 0 (implementer, fix round 2; controller ran test:run).
Live check (scratchpad lock-live-check.mjs, output lock-live-check.txt): lock 200; reload shows Q1 locked; late answer 400 "Answers are locked for this question."; second lock 400 "Question already locked"; dashboard Lock disabled on load, after 6.5 s refetch and after reload; advance re-enables; two parallel locks on Q2 → 200 + 400; reset and start clear all locks; answer after restart accepted. Parallel locks on Q1 with a scored player → 200 + 400, leaderboard_snapshots 1 row for index 0 (1 player). Quiz cmvaoahhj00002mwo1628cfkj reset and deleted (GET → 404).
Findings: docs/progress/findings/2026-10-16-persist-answer-lock.md. The E2E branch's two round-transitions lock tests are the automated check once test/e2e-isolated-quizzes has this fix.
Out-of-scope items from the spec: recording them as tracked items waits for the user's choice of place.
Task 3: complete

## End-of-branch passes
User go-ahead 2026-10-16 ("yes"). Range d839d5f..b9fc943 (origin/master merge base to Task 3's findings commit). Production code changed (repository, mapper, three use cases): all three reports — whole-branch review (task-reviewer-capable, handback saved as final-whole-branch-review.md), silent-failure hunt (final-silent-failure-hunt.md), simplification report (final-simplification.md, report only).
Tamper baseline: HEAD b9fc943, git status --porcelain " M progress.md" (this section, appended just before), ledger listing recorded (11 files, progress.md 08:57:05).
Tamper checks after each return: HEAD b9fc943 and status unchanged; ledger listing gained only final-simplification.md and final-silent-failure-hunt.md (each agent's own report). Whole-branch review returned in its handback, saved as final-whole-branch-review.md. Reviewer's verdict run: yarn test:run 503 passed | 1 skipped (504) exit 0; lint exit 0 (5 warnings, untouched files); tsc exit 0.

### Ruling table
| Finding (sources) | Ruling | Cost if wrong |
|---|---|---|
| Broadcast failure after a persisted lock → 400, retry refused, summary lost (W1, S1; triage of T2 minor 1) | Fix: wrap the lock route's broadcast in its own try/catch with console.warn, return 200 with the summary, as start/reset do; route test where the broadcast rejects | — |
| No route test pins the lock route's mapping (S6) | Fix with W1: route tests for 200 + broadcast, broadcast rejects → 200, "Question already locked" → 400, "not active" → 404 | — |
| Lock route logs nothing on error (S2, logging half) | Fix: console.error in the lock route's catch (file touched by W1) | — |
| Non-domain errors map to 400, not 500, in lock and start routes (S2, status half) | Defer — pre-existing on master, not caused by the branch; changing the regex means auditing every domain message the routes can throw. Record as an out-of-scope item | A DB outage reads as 400 to the host, as on master today |
| Reset refusal "can only be reset" maps to 500 (S7) | Defer — pre-existing on master, unrelated to the lock. Record as an out-of-scope item | Same as today |
| `lockQuestion` false always reported "already locked", also for a quiz/question deleted mid-request (S3) | No change — needs a deletion racing a lock in the same few ms; the 400 is still a refusal | A host who deletes in another tab mid-lock sees "already locked" |
| `answersLockedAt!` hides that lockCurrentQuestion sets it; an unset value would reach Prisma as an empty update (S4, P3) | Fix: lockCurrentQuestion returns the Date; the use case passes it; domain test asserts the return | One domain signature void → Date; callers ignore it |
| Integration fake's quiz.update ignores nested question writes, so the stale-save test can't see option A creeping in (S5) | Fix: fake throws on nested `questions`/`answers`/`players` data | — |
| Shared-quiz round-transitions E2E becomes order-dependent after merge (W2) | Fix (docs): ledger line here and the findings record; transient until the E2E branch's Task 2 | — |
| Spec/plan wording drift (W3) | Fix (docs): spec Testing lines, Design 5 clause; plan file table, "narrows", findings file name | — |
| Findings overclaims the Postgres mechanism (W4) | Fix (docs): reword to outcome observed, mechanism from Postgres semantics | — |
| Whole-aggregate save loses concurrent answers (W5) | Fix (docs): add to the spec's out-of-scope list | — |
| Race test duplicates the audit describe's setup (P1) and stubs unreachable mocks (P2) | Apply | — |
| Repeated Prisma fixture in repository tests (P4) | Skip — the simplifier itself says skip unless the older test is touched | Two ~25-line fixtures stay |
| Integration fakes list unused methods (P5) | Skip — matches the neighbouring full-surface style | — |
| `save(stale!)` (P6) | Apply the guard only; leave lock() where it is | — |
| P7, P8 | No edit (simplifier) | — |
| Clear-before-save not atomic; server clock; same error text (simplifier's non-simplifications) | No change — ruled in Design 5 / Task 2; intentional | — |
W2 note: after this merges, master's e2e/round-transitions.spec.ts (shared JOIN-KYTX quiz) can fail "toBeEnabled" when the shared quiz's question is already locked by an earlier or parallel test; the E2E branch's Task 2 rewrites it on per-test quizzes.

### Fix wave (branch fix/persist-answer-lock-final-fixes, cut from b9fc943)
- 798d20d docs: the three reports and the ruling table.
- f352ed5 lock route broadcast in its own try/catch + console.warn, console.error in the catch; new src/tests/app/api/lock-question-route.test.ts (4 tests). Red on the old route: 1 failed | 3 passed (the broadcast-rejects test); green 4 passed. Full: yarn test:run exit 0, Test Files 68 passed | 1 skipped (69), Tests 507 passed | 1 skipped (508).
- 971438e lockCurrentQuestion returns the Date; use case passes it (no `!`); domain test asserts the return is the stored Date. lint, tsc exit 0; yarn test:run exit 0, 507 passed | 1 skipped (508).
- 742ed9c integration fake's quiz.update throws on nested questions/answers/players; `stale!` replaced by a guard. Mutation check: a nested `questions: { updateMany: [] }` added to save → 7 failed (7) in the file; restored (git diff empty).
- 7415d2b race test moved into the audit describe, unreachable stubs dropped (P1, P2). lint, tsc exit 0; yarn test:run exit 0, Test Files 68 passed | 1 skipped (69), Tests 507 passed | 1 skipped (508).
- df56cfc docs: spec Testing and Design 5, out-of-scope list (+ lost-update save, lock/start 400 mapping, reset refusal 500; broadcast removed from the persisted-lock item), plan file table / "narrows" / findings name, findings mechanism wording and the shared-quiz E2E note.

### Fix-wave re-review
task-reviewer-capable over b9fc943..6620035: APPROVED, 4 minors (final-fixwave-rereview.md). Tamper check clean (HEAD 6620035, status empty, ledger listing unchanged).
- R1 (refusals logged at error level): no change — matches both reset routes; revisit with the deferred status mapping — cost: log noise on a double click.
- R2 (error log unpinned), R3 (pre-existing `!` in the round summary), R4 (spec Testing lists): fixed in 183efd6 — lockedAt passed into buildRoundSummary; 400 route test asserts console.error; spec lists all 7 integration behaviours and marks which route test failed first. lint, tsc exit 0; yarn test:run exit 0, Test Files 68 passed | 1 skipped (69), Tests 507 passed | 1 skipped (508).
Branch passes: complete. Next: bring fix/persist-answer-lock-final-fixes into fix/persist-answer-lock (fast-forward), PR draft for the user's approval.
Doc sweep after branch passes: PATTERNS.md realtime convention (broadcast after a write fails soft); nothing new measured beyond the mutation and red runs logged above; CLAUDE.md unaffected.
PR #81 opened 2026-10-16 with the user-approved text ("approve"). Merge waits for the user's go-ahead; at merge: spec and plan status to "✅ Complete — PR #81", PROGRESS.md work index line.

PR #81 merged 2026-10-16 (merge commit dfcd22e) on the user's "merge". Out-of-scope items: user chose GitHub issues; drafts checked against the code first (the timer and FIXED items were restated), posted 2026-10-18 on the user's "post" as #82–#89 (bug label); the spec's out-of-scope list links each item.
