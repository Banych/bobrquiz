# Fix-wave re-review — persist the answer lock (b9fc943..6620035)

Agent: task-reviewer-capable (opus pin), read-only, 2026-10-16. Returned in its handback; saved by
the main session (condensed: findings and verdicts verbatim in substance).

## Verdict

APPROVED. Every Fix/Apply ruling addressed in full; every Defer/No change/Skip recorded where the
ledger says. No new bug. Counts re-run and matching the ledger. Four Minor, all optional.

## Findings

- **R1 Minor** `lock-question/route.ts:40`: `console.error` logs expected refusals ("Question already
  locked", "No active question to lock.") at error level. Consistent with both reset routes. No
  change needed for the merge; if the deferred status mapping is picked up, log at error only on 500.
- **R2 Minor** `lock-question-route.test.ts`: nothing pins the `console.error`. Optional: assert it in
  the 400 test.
- **R3 Minor, pre-existing (master :180)** `lock-question.use-case.ts:190`:
  `currentQuestion.answersLockedAt!.toISOString()` still asserts. Optional: pass `lockedAt` into
  `buildRoundSummary`.
- **R4 Minor, docs** spec Testing: the Integration bullet lists 4 of the file's 7 behaviours; the
  Route bullet sits under "Failing first" though only the broadcast test was red.

## Per-ruling table

All addressed: W1/S1 (route try/catch, 200), S6 (4 route tests), S2 logging (route :40), S2 status and
S7 (recorded, spec out-of-scope), S3 (ledger only), S4/P3 (Date return, one production caller), S5
(fake guard; no real `quiz.update` passes relations: :145, :177, :259), W2 (ledger + findings), W3,
W4, W5 (spec), P1/P2, P4/P5 skip recorded, P6 guard, P7/P8 no change.

## Evidence

- HEAD 6620035, status empty, at start and end.
- `git diff b9fc943..HEAD -- src` matches review-b9fc943..fixwave.diff.
- `yarn test:run`: Test Files 68 passed | 1 skipped (69); Tests 507 passed | 1 skipped (508); exit 0.
- Four touched test files: 4 passed (4), 37 passed (37), exit 0.
- `yarn lint`: exit 0, 0 errors, 5 warnings in untouched files. `tsc`: exit 0.

## Unverified

The route test's red run and the fake-guard mutation (plausible from code, not re-run); the E2E
shared-quiz failure (E2E not run).
