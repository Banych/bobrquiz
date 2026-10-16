# Task 1 report

## Status
DONE

## Built
- `IQuizRepository`: `lockQuestion(quizId, questionId, lockedAt): Promise<boolean>` and `clearQuestionLocks(quizId): Promise<void>`, after `updateLeaderboard`.
- `PrismaQuizRepository`: `lockQuestion` runs `prisma.question.updateMany({ where: { id, quizId, answersLockedAt: null }, data: { answersLockedAt } })` and returns `count === 1`. `clearQuestionLocks` runs `updateMany({ where: { quizId }, data: { answersLockedAt: null } })`.
- `mapPrismaQuestionToDomain`: `question.answersLockedAt = record.answersLockedAt ?? undefined`.
- Tests: the brief's code verbatim (questionMocks wired into the vi.mock factory and beforeEach; `answersLockedAt: null` on both records in the mapping test plus the toBeUndefined assertion; the four new tests).
- `save` and `mapQuestionToPrismaUpdateInput` untouched.

## Commits
4590411 (full hash 459041103647051f1c378677240803709201980f)
```
 src/domain/repositories/quiz-repository.ts         |  8 ++
 .../repositories/mappers/prisma-question-mapper.ts |  1 +
 .../repositories/prisma-quiz.repository.ts         | 19 +++++
 .../repositories/prisma-quiz-repository.test.ts    | 93 ++++++++++++++++++++++
 4 files changed, 121 insertions(+)
```

## Departures from the plan
None. I ran `yarn prisma:generate` first (git-ignored output only). The first `yarn -s eslint --fix` call failed because of a quoting slip of mine (zsh did not split a variable); I reran it with explicit file args, exit 0, and it changed nothing.

## Tests
- Red, `yarn test:run src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts` before the change: `Tests  4 failed | 11 passed (15)`, exit 1. The 3 method tests failed with `repository.lockQuestion is not a function` / `repository.clearQuestionLocks is not a function`. I saw the tail of the output only, which covered 2 of the 4 failures. I take the restore test to be one of the other two, but did not see it.
- Green, same file after the change: `Test Files  1 passed (1)`, `Tests  15 passed (15)`, exit 0.
- `yarn test:run` (whole suite): `Test Files  66 passed | 1 skipped (67)`, `Tests  493 passed | 1 skipped (494)`, exit 0. The 1 skipped test was already there; I added no `.skip`.
- `yarn lint`: exit 0, 0 errors, 5 warnings (all in files I did not touch: admin layout, question-view, three tests/load files).
- `yarn -s tsc --noEmit -p .`: exit 0.
- `yarn -s eslint --fix <4 touched files>`: exit 0.

## Evidence
```
 Test Files  1 failed (1)
      Tests  4 failed | 11 passed (15)
 Test Files  1 passed (1)
      Tests  15 passed (15)
 Test Files  66 passed | 1 skipped (67)
      Tests  493 passed | 1 skipped (494)
✖ 5 problems (0 errors, 5 warnings)
TSC 0
```

## Unverified
- Which 4 tests failed in the red run (only the last 2 were visible).
- No red/green check that the `answersLockedAt: null` mapping assertion fails when the mapper passes `null` through. I did not revert the mapper line to try it.
- The 1 skipped test in the suite is not mine and I did not look at why it is skipped.
