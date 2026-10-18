# Task 1 report

## Status
DONE

## Built
e2e/support/quiz-fixtures.ts, e2e/quiz-fixtures.spec.ts (verbatim from brief), e2e/stale-quizzes.cleanup.ts, playwright.config.ts (cleanup project).

## Commits
8c33aed

## Tests
- RED: `yarn test:e2e e2e/quiz-fixtures.spec.ts --retries=0` before implementation: "No tests found", exit 1 (module missing).
- GREEN: same command: `11 passed (9.8s)`, exit 0; output contains `[CLEANUP] deleted 0 stale fixture quizzes`.
- `yarn eslint --fix <touched files>`: exit 0. `yarn lint`: exit 0, 5 warnings, 0 errors, none in touched files. `yarn -s tsc --noEmit -p .`: exit 0.

## Departures
None.

## Evidence
11 passed (9.8s); lint "(0 errors, 5 warnings)"; tsc=0.

## Fix round 1
Commit 22be611. Teardown runs every delete and throws one AggregateError; cleanup-on-failure error is console.warn'd (original rethrown); reset accepts 404 and returns.
- `yarn eslint --fix e2e/support/quiz-fixtures.ts`: exit 0
- `yarn test:e2e e2e/quiz-fixtures.spec.ts --retries=0`: `11 passed (7.7s)`, exit 0
- `yarn lint`: exit 0, "5 problems (0 errors, 5 warnings)"
- `yarn -s tsc --noEmit -p .`: exit 0

## Fix round 2
Commit e851f5c. sweepFixtureQuizzes attempts every matching delete, counts only successes, throws one AggregateError (quiz id plus message) after the loop.
- `yarn eslint --fix e2e/support/quiz-fixtures.ts`: exit 0
- `yarn test:e2e e2e/quiz-fixtures.spec.ts --retries=0`: `11 passed (7.4s)`, exit 0
- `yarn lint`: exit 0, "5 problems (0 errors, 5 warnings)"
- `yarn -s tsc --noEmit -p .`: exit 0
