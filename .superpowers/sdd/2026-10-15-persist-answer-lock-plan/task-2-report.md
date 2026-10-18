# Task 2 report

## Status
DONE

## Commits
a244b8cebd179019d636791c5ec4c25017639437 fix(quiz): keep the answer lock across requests

```
 .../use-cases/lock-question.use-case.ts            |  10 +
 src/application/use-cases/reset-quiz.use-case.ts   |   1 +
 src/application/use-cases/start-quiz.use-case.ts   |   1 +
 .../use-cases/lock-question.use-case.test.ts       |  73 ++++++++
 .../use-cases/reset-quiz-use-case.test.ts          |   7 +
 .../use-cases/start-quiz-use-case.test.ts          |   6 +
 .../integration/answer-lock-persistence.test.ts    | 204 +++++++++++++++++++++
 7 files changed, 302 insertions(+)
```

The commit has no attribution trailer (global rule over the reminder).

## What changed
- LockQuestionUseCase: after `quiz.lockCurrentQuestion()` it calls `quizRepository.lockQuestion(quizId, currentQuestion.id, currentQuestion.answersLockedAt!)`; on false it throws `Question already locked`, before snapshots, save or audit.
- ResetQuizUseCase and StartQuizUseCase: `clearQuestionLocks(quizId)` after the domain transition, before `save`.
- Tests: brief's code verbatim in the three unit files and the new integration file.

## Tests
Step 2, before implementing:
`yarn test:run <the four files>` -> `Test Files  4 failed (4)` / `Tests  9 failed | 15 passed (24)`, exit 1.
Failing: lock "persists the lock before writing snapshots", lock "throws and writes nothing ...", reset "resets a completed quiz and saves it", start "should start a quiz and update its status to Active", integration "keeps ... locked", "rejects an answer ...", "a stale aggregate ...", "rejects a second lock ...", "clears a lock written after a reset ...". "clears persisted locks when the quiz is reset" and all the `not.toHaveBeenCalled` guards passed. This matches the brief's expectations exactly.

After implementing, same four files: `Test Files  4 passed (4)` / `Tests  24 passed (24)`, exit 0.
Full `yarn test:run` (run twice, before and after `eslint --fix`): `Test Files  67 passed | 1 skipped (68)` / `Tests  501 passed | 1 skipped (502)`, exit 0 (first run).
`yarn eslint --fix <7 touched files>`: exit 0, no diff produced. `yarn lint`: exit 0 (0 errors, 5 pre-existing warnings in files I did not touch). `yarn -s tsc --noEmit -p .`: exit 0.

## Departures from the plan
None. The stateful Prisma fake ran as drafted; no extension was needed and no assertion changed.

## Evidence
- Before: `Tests  9 failed | 15 passed (24)`
- After: `Tests  24 passed (24)`, `EXIT 0`
- Full: `Tests  501 passed | 1 skipped (502)`
- The 1 skipped test is a pre-existing `.skip` in `src/tests/integration/add-player.integration.test.ts` (found by grep for `.skip`), not mine.
- `git status` showed `.superpowers/.../progress.md` modified before I started; I left it uncommitted.

## Unverified
- Whether the skipped test in add-player.integration.test.ts was already skipped on master: I only saw the `.skip` text in the file, not its history.

## Fix round 1
Commit 5eedda5b6253d7cf1c89499a144aa481931debec (tests only): concurrent-lock integration test (Promise.allSettled; exactly one fulfilled, one rejected 'Question already locked', one snapshot set; a spy on lockQuestion shows outcomes [false, true], so the repository's false path and the fake's no-match path ran), late-lock result asserted true, reset test checks the lock existed before and 2 questions after, new start-from-non-Pending test.
Runs: two touched files 'Tests  12 passed (12)' exit 0; full 'Tests  503 passed | 1 skipped (504)' exit 0; eslint --fix exit 0; lint exit 0; tsc exit 0.

## Fix round 2
Commit 5e3d72ab8ded3d627dc1d1e2169939ecf9c3875b (test only): the concurrent-lock test now restores its spy in try/finally. Runs: file 'Tests  7 passed (7)' exit 0; full 'Tests  503 passed | 1 skipped (504)' exit 0; eslint --fix, lint, tsc exit 0.
