# Persisted answer lock on a live dev server — findings (2026-10-16)

**Ran:** branch `fix/persist-answer-lock` at 06e242f (Tasks 1 and 2 of
`docs/progress/plans/2026-10-15-persist-answer-lock-plan.md`), `yarn dev -p 3001` from its worktree
(Next.js 16.3.8, Turbopack), CachyOS, the dev Supabase database. Driven by a Playwright script
(`request` with the admin session from `e2e/auth.setup.ts`, plus one headless Chromium page on the
host dashboard). Ledger: `.superpowers/sdd/2026-10-15-persist-answer-lock-plan/progress.md`.

## What was run and what happened

Quiz `cmvaoahhj00002mwo1628cfkj` ("E2E fixture lock-live-check …", three text questions, 60 s per
question), started, one player joined through `POST /api/session/join`.

| Step | Result |
|---|---|
| Lock question 1 (`POST /api/quiz/{id}/lock-question`) | 200 |
| `GET /api/quiz/{id}/state` in a new request | Q1 `answersLockedAt` = the lock time; Q2, Q3 `null` |
| Player answers Q1 after the lock (`POST /api/player/answer`) | 400 "Answers are locked for this question." |
| Lock Q1 again | 400 "Question already locked" |
| Host dashboard Lock Question button | disabled on load, still disabled after 6.5 s (one 5 s refetch), still disabled after a page reload |
| Advance to Q2 | 200; Lock Question enabled again |
| Two lock requests for Q2 at once (`Promise.all`) | one 200, one 400 "Question already locked"; Q2 locked once |
| Reset (`POST /api/quiz/{id}/reset`) | 200; Pending, every question `null` |
| Start again | 200; every question `null` |
| Player answers Q1 after the restart | 200, accepted; Lock Question enabled on the dashboard |
| Two lock requests for Q1 at once, after the player had answered | one 200, one 400; `leaderboard_snapshots` holds 1 row for question index 0 (1 player): one snapshot set |

Before the fix, the same sequence would have re-enabled the button on the first refetch, accepted
the late answer, accepted the second lock and written a second snapshot set (root-cause report in
the ledger directory).

The two-request race is the check the unit and integration tests cannot make: it shows Postgres
re-checks `"answersLockedAt" IS NULL` in the single `UPDATE` that `updateMany` sends, so exactly
one request wins.

## Gotchas met

- The first parallel-lock check (Q2) proved nothing about snapshots: no player had answered, the
  leaderboard was empty, and `saveSnapshots` writes no rows for an empty leaderboard. The snapshot
  count needs a player with an answer before the lock.
- The snapshot table is `leaderboard_snapshots` (mapped), not `"LeaderboardSnapshot"`; the quiz
  table is `"Quiz"`. Look names up in `information_schema.tables` before querying.
- A worktree needs its own `node_modules` to run `yarn dev`
  (`docs/progress/findings/2026-10-15-worktree-dev-server-node-modules.md` on
  `test/e2e-isolated-quizzes`).

## Cleanup

The quiz was reset and deleted through the admin API; `GET /api/admin/quizzes/{id}` then returned
404 (its questions, player, answers and snapshots cascade).

## Still to come

The E2E branch's round-transitions tests "should disable Lock Question after locking" and "should
re-enable Lock Question after advancing" become the automated check for this once
`test/e2e-isolated-quizzes` has this fix.
