# E2E failures under parallel load: the 2-connection Prisma pool — findings (2026-10-18)

**Ran:** branch `test/e2e-isolated-quizzes` at e164948, `yarn dev` from its worktree (Next.js 16.3.8,
Turbopack), CachyOS, the dev Supabase project (Supavisor eu-west, transaction mode on 6543). Probe
scripts drove the app's admin API with the E2E admin session; Supabase MCP for `pg_stat_activity`,
`pg_stat_statements` and logs. Ledger: `.superpowers/sdd/2026-10-15-e2e-isolated-quizzes-plan/progress.md`.

## Symptom

A full `yarn test:e2e --retries=0` (48 tests, 6 workers) gave 5 failed / 3 did not run / 40 passed
(59.7 s): two fixture `POST /api/admin/quizzes` hit the 15 s request timeout, two admin create
dialogs stayed open past 5 s, one admin sign-in stayed on `/login`. Two full runs earlier the same
day, with no `src/` change between, gave 43 passed (~40 s) and one unrelated failure.

## Cause

`src/infrastructure/database/prisma/client.ts` sets the pg adapter pool to `max: 2`. Every
statement holds one of the two connections for one network round trip (46 ms, flat; execution in
Postgres is 0.02–0.8 ms), so the whole dev server runs at most ~43 statements/s. Above that,
statements wait in pg.Pool's queue, which has no timeout. Since this branch, every test builds its
own quiz through the API, and the suite's polling dashboards keep the pool near full.

| Measurement | Result |
|---|---|
| `select 1`, warm connection, ×10 | 46 ms median (46–47) |
| New pg connection, ×5 | 171 ms median |
| Fixture-shaped create (quiz + 2 questions) through the app, concurrency 1 / 2 / 4 / 6 / 8 | 749 / 854 / 1328 / 1917 / 2607 ms median |
| Sustained concurrency 6, 60 creates | 3.1 creates/s = 43.4 statements/s |
| Scratch pg.Pool, 14 round trips per "create", max 2 at concurrency 6 / 8 | 1781 / 2413 ms median (reproduces the app) |
| Same, max 10 at concurrency 6 / 8 | 652 / 649 ms median (flat) |
| `GET /admin` (no DB), idle → during a 6-way burst | 126 → 131 ms median |
| One-statement API route, idle → during the burst | 144 → 358 ms median |
| 12 simulated host dashboards polling every 5 s | 6-way create median 1917 → 3394 ms |
| `pg_stat_activity` during bursts (3 samples) | 5 Supavisor backends, all idle; queue is client-side |
| Auth logs, failing run | 109 admin requests in the first 10 s (~650 statements ≈ 15 s of backlog), then a stall |

Statements per fixture quiz with two questions (from `pg_stat_statements` around one create and
one delete): 26 if it stays Pending, 41 if started (create 2, each question 6, state GET 4, start 8,
teardown 8 or 15). `findById` alone is 4 sequential statements (one per relation).

Refuted: dev-server CPU (the no-DB page did not slow; CPU low), Supavisor or Postgres (a pool of
10 runs 8 at once without slowing; no pooler errors), Supabase Auth (74 ms median, no 429s).
Unknown: why `admin-auth.spec.ts:145` stayed on `/login` — that path touches no database; the
form was idle with no error, so `router.push` + `router.refresh()` did not land within 5 s.

Why runs differ: the suite sits near the ceiling, so ordering decides whether fixture bursts land
on top of polling; close to saturation the queue grows without bound.

## Gotchas met

- pg.Pool drops idle connections after 10 s by default; each reconnect costs ~170 ms.
- A keyword filter over Playwright error-context files missed a filled Password textbox in a
  page snapshot; delete such lines by the field name, and check before quoting.

## Cleanup

161 probe quizzes (`E2E fixture load-probe …`), each re-read after deletion: 161 × 404; SQL count of
probe titles 0.

## Outcome (2026-10-18)

- Fix: `DATABASE_POOL_MAX` (spec section 6), 10 in the dev worktree's `.env.development.local`.
  Full `yarn test:e2e --retries=0` with the pool at 10: 48 passed (35.3 s), exit 0.
- A second limit appeared once the pool stopped queueing: two full runs back to back put ~14 UI
  joins into one 60 s window, and four reconnection tests got 429 "Too many requests" (found in
  the error contexts; the runs passed on retry, exit 0). Fix: `SESSION_JOIN_RATE_LIMIT` (spec
  section 7), 100 in dev. Two default-retry runs back to back then gave 48 passed each (33.1 s,
  26.9 s), no flaky, 0 "Too many requests".
- Branch passes: three overlapping reconnection tests dropped, so a run makes 4 join requests;
  every join asserts its response; `failOnFlakyTests` makes a pass on retry exit 1. Two runs back
  to back: 45 passed each (24.2 s, 26.0 s), 0 flaky, exit 0.
- Ledger: `.superpowers/sdd/2026-10-15-e2e-isolated-quizzes-plan/progress.md`, Tasks 4b and 5b
  and the branch passes.
