# Task 4 report

## Status
DONE_WITH_CONCERNS. The full `yarn test:e2e --retries=0` is not green: one test in admin-auth.spec.ts (not touched by this branch) fails whenever it runs alongside other specs. Everything this task touched passes.

## Commits
7d5c7b9 test(e2e): move admin specs to the fixture, drop the shared quiz
 .gitignore (-1), e2e/README.md, e2e/admin-question-crud.spec.ts, e2e/admin-quiz-crud.spec.ts, e2e/fixtures.ts (deleted), e2e/quiz.setup.ts (deleted); 6 files, 36 insertions, 148 deletions.

## Departures from the plan
1. The plan's update-test title: the brief gave `${FIXTURE_TITLE_PREFIX}admin-quiz-update ${Date.now()}` for the original, but the test then renames it to `<original> - Updated`, which ends without a timestamp, so `fixtureTimestamp` returns null and the sweep would skip it. Chosen: both titles end in the same timestamp: `...admin-quiz-update ${stamp}` renamed to `...admin-quiz-updated ${stamp}`. The sweep and its tests are unchanged. The create and delete titles parse as the brief gave them (regex `\s(\d+)(?:-[^\s]+)?$` accepts a bare trailing number; checked in the code, and a title with `-suffix` too). Not run through node: that command was denied.
2. Prettier on e2e/README.md added a blank line before a list in "CI/CD", unrelated to the change; reverted by hand to keep the diff to the change.
3. Deleted the stale untracked local file playwright/.quiz-info.json (it appeared as untracked once its .gitignore line went).
4. Admin-quiz-crud first test, active-quiz test: as in the brief.

Remaining references: git grep for getQuizId|getJoinCode|getQuizInfo|quiz-info|TEST_QUIZ_ID|TEST_JOIN_CODE in e2e, playwright.config.ts, .gitignore prints nothing; `JOIN-KYTX|quiz.setup` in e2e prints nothing. Outside e2e, JOIN-KYTX / quiz.setup / fixtures.ts are only in dated history docs (docs/progress/sessions/2025-12-19, 2026-02-01, 2026-02-07; docs/progress/findings/2026-10-16-persist-answer-lock.md) and src/infrastructure/database/prisma/seed-helpers.ts (the seed's own default, TEST_JOIN_CODE). Left as they are: history records, and the seed is not E2E.

## Concerns
- admin-auth.spec.ts:39 "should show error for invalid credentials" fails with --retries=0 in every run that has any other spec running in parallel (full suite x2, without the admin specs x2, with only supabase-clients.spec.ts, and 2 of 3 with --repeat-each=3), and passes when the file runs alone once. Cause: strict mode violation, the text "Invalid login credentials" matches both the form error and the Next dev error overlay (#nextjs__container_errors_desc). It fails the same with none of this task's files in the run, and the spec is untouched on this branch; so it looks pre-existing, but no baseline run on master was done (Unverified). The spec is serial, so the 4 later admin-auth tests show "did not run". Not fixed: out of scope.
- One run (noadmin, first) also failed 4 player-reconnection tests with waitForURL timeouts in joinAsPlayer. Its test-results/ were overwritten by the next run before inspection, so the cause is unknown; "Too many requests" count in that output was 0. A rerun of the same command passed those tests (31 passed, only the admin-auth failure). Flag for Task 5's runs.

## Evidence
Admin specs: `yarn test:e2e e2e/admin-quiz-crud.spec.ts e2e/admin-question-crud.spec.ts --retries=0`
  14 passed (22.9s)   exit 0

Full run 1: `yarn test:e2e --retries=0`
  1 failed
    [chromium] › e2e/admin-auth.spec.ts:39:3 › Admin Authentication › should show error for invalid credentials 
  4 did not run
  43 passed (43.2s)   exit 1; no flaky, no skipped printed
Full run 2: same command
  1 failed (same test)
  4 did not run
  43 passed (39.5s)   exit 1

"Too many requests": 0 in full run 1 output, 0 files in test-results/; 0 and 0 in full run 2; 0 in the output and test-results/ of the two extra runs below.

Extra runs (--retries=0, --grep-invert "Admin Quiz CRUD|Admin Question CRUD"):
  run A: 5 failed (admin-auth:39, player-reconnection:80, :100, :117, :132), 4 did not run, 27 passed (46.5s), exit 1
  run B: 1 failed (admin-auth:39), 4 did not run, 31 passed (36.6s), exit 1
admin-auth.spec.ts alone: 8 passed (10.9s), exit 0
admin-auth + player-join: 1 failed (admin-auth:39), 4 did not run, 6 passed (7.1s), exit 1
admin-auth + supabase-clients: 1 failed (admin-auth:39), 4 did not run, 5 passed (4.3s), exit 1
admin-auth --repeat-each=3: 10 passed, 8 did not run, with 2 failures of admin-auth:39, exit 1

Cleanup project in the admin run printed "[CLEANUP] deleted 0 stale fixture quizzes".
yarn lint: exit 0. yarn -s tsc --noEmit -p .: exit 0.

## Unverified
- Whether the admin-auth failure also occurs on master or on this branch before Task 4 (no baseline run).
- Cause of the one-off player-reconnection failures (evidence overwritten).
- That the sweep actually removes the quizzes the admin UI tests leave: only the regex was reasoned through, not run (tests leave 2 quizzes per run; the next run's cleanup only deletes ones older than 30 minutes).
- Raw output files: /tmp/claude-1000/-home-banykinv-Documents-repos-bobrquiz/479c38f6-ccc5-4fd2-a196-c9a45435d594/scratchpad/t4-*.txt
