# Test type fixes report

Status: DONE

## Changes
- quiz-routes.test.ts:36: getServices mock gained questionService, auditService, lockQuestionUseCase, getPlayerConnectionStatusUseCase as `{} as ServiceContainer[...]`, like its neighbours.
- quiz-routes.test.ts:60,73,87,103: `params: Promise.resolve({ quizId: ... })`.
- player-service.test.ts:47: 7th ctor arg was RemovePlayerUseCase; mocked like the others. No test asserts on it.
- quiz-service.test.ts:93: 13th ctor arg was ResetQuizUseCase (last); mocked like the others.
- create-quiz.use-case.test.ts (6 inputs): added scoringAlgorithm: 'EXPONENTIAL_DECAY', the zod default in src/application/dtos/quiz-admin.dto.ts:11. No test asserts on scoringAlgorithm, so no assertion changed.

## Acceptance
1. tsc --noEmit -p . : exit 0, no errors
2. yarn test:run: Test Files 65 passed | 1 skipped (66); Tests 466 passed | 1 skipped (467); exit 0
3. yarn lint: exit 0, 5 problems (0 errors, 5 warnings)
4. yarn build: exit 0

## git show --stat
commit fda0c085e09bdd162b543bf5fad474eff6c9eff0
Author: Vladislav Banykin <banykinv@gmail.com>
Date:   Thu Oct 15 19:44:30 2026 +0100

    test: fix type errors that next 16.3 build now checks
    
    Next 16.3 type-checks test files during yarn build; the mocks and inputs had drifted from the current types. Runtime behaviour is unchanged.

 src/tests/app/api/quiz-routes.test.ts                       | 13 +++++++++----
 src/tests/application/services/player-service.test.ts       |  9 ++++++++-
 src/tests/application/services/quiz-service.test.ts         |  9 ++++++++-
 .../application/use-cases/create-quiz.use-case.test.ts      |  6 ++++++
 4 files changed, 31 insertions(+), 6 deletions(-)
