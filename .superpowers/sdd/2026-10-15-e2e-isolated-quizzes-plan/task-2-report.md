# Task 2 report

## Status
DONE

## Commits
80889379be3109ccfe09e23ccd4158cfa2a3b9da test(e2e): give host specs their own quizzes
 e2e/host-dashboard.spec.ts    |  88 ++++++++++++++----------------
 e2e/round-transitions.spec.ts | 122 +++++++++---------------------------------
 2 files changed, 66 insertions(+), 144 deletions(-)

## Tests
`yarn test:e2e e2e/host-dashboard.spec.ts e2e/round-transitions.spec.ts --retries=0`, twice.
Run 1: `9 passed (13.3s)`, exit 0. Run 2: `9 passed (11.5s)`, exit 0.
`yarn lint`: exit 0, 0 errors, 5 warnings (none in the touched files).

## Departures from the plan
None. The plan's code was written verbatim; selectors matched the real components
(round-summary-dialog.tsx, host-quiz-dashboard.tsx). `yarn eslint --fix` changed nothing.
The two lock tests passed with the persisted lock from PR #81; no assertion was loosened.

## Evidence
- Run 1: `9 passed (13.3s)`, exit=0, "Too many requests": 0 in output, 0 files in test-results/
- Run 2: `9 passed (11.5s)`, exit=0, "Too many requests": 0 in output, 0 files in test-results/
- `[CLEANUP] deleted 0 stale fixture quizzes` in both runs
- Output saved at scratchpad t2-run1.txt, t2-run2.txt, t2-lint.txt

## Unverified
Quiz deletion after the runs was not checked against the database (the fixture teardown threw nothing).

## Fix round 1

Commit: 279fe7b149a414973051261a0ba8515af1c084c9 (test(e2e): check the host question list shows both questions)

Locator: `page.locator('ol')`, then `getByText(QUESTIONS.capitalOfFrance.text)` and `getByText(QUESTIONS.largestPlanet.text)`, no `.first()`. The questions section (`QuestionTimeline` in src/components/host/question-timeline.tsx) has no test id; its `<ol>` is the only ordered list in src/components and src/app, and the Timer panel's repeated question text is outside it. Narrowest real hook: the element type.

## Evidence

- Positive run: `yarn test:e2e e2e/host-dashboard.spec.ts --retries=0` -> "5 passed (6.7s)", exit 0, "Too many requests": 0 in output, 0 in test-results/.
- Negative run (largestPlanet assertion temporarily changed to "Which planet is the SMALLEST"): "1 failed", "4 passed (9.6s)", exit 1; "Locator: locator('ol').getByText('Which planet is the SMALLEST')", "Error: element(s) not found"; "Too many requests": 0 and 0. Text restored; git diff showed only the intended change.
- `yarn eslint e2e/host-dashboard.spec.ts`: exit 0, no output.
