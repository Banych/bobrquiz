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
