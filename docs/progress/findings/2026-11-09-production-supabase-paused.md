# Production Supabase paused for inactivity — findings (2026-11-09)

**Ran:** issue 126 (restore production and check its configuration). Supabase MCP against the
org `pgdavqvzxncsvpjdlcrn`, Vercel MCP against project `bobrquiz`, a `yarn dev` server in a
worktree pointed at `Quiz-game-dev`, CachyOS.

## Symptom

bobrquiz.vercel.app served the app while its database, Supabase project `quiz-game-prod`
(`noyjptzwsagwofwsevwm`), was paused: no game could run. It was first noticed by 2026-10-30. The
note the issue cites for that date (`PRIORITIES.md`) is not in the repository. The exact pause
date is unknown; Supabase's "has been paused" email would have it.

## Cause

The organization is on the **Free** plan (`get_organization`: `plan: free`). Supabase pauses
Free-plan projects that "do not receive sufficient user database activity over the past week";
paid projects are never paused (docs: `guides/platform/free-project-pausing`, read 2026-11-09).
Production had no real users, so a week without traffic was enough. On 2026-11-09 every one of
the org's six projects was `INACTIVE`, the dev project `Quiz-game-dev` included.

The docs say "a few user requests to the database each day over the previous week is enough to
keep the project from being paused", and Supabase emails a warning about a week before pausing.

## What was checked on 2026-11-09

| Check | Result |
|---|---|
| Restore `quiz-game-prod` and `Quiz-game-dev` (`restore_project`) | Both `ACTIVE_HEALTHY` within minutes; data and config came back |
| Prod migrations: `_prisma_migrations` vs the 7 folders in `migrations/` | 7 of 7 applied, all finished, none rolled back: nothing pending |
| Dev migrations: `prisma migrate status` | "Database schema is up to date!" (7 found) |
| Vercel production env names vs `src/lib/env-validation.ts` | All six present: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS` |
| Vercel production env values | Not readable: Sensitive type is write-only. Only a working game on production proves them |
| Production deployment | bobrquiz.vercel.app is the production domain (`quiz-game-kappa-sepia.vercel.app` 307-redirects to it); live deployment is master `5aef973`, READY |
| Unit tests (`yarn test:run`) | 528 passed, 1 skipped, exit 0 (with the keepalive change) |
| E2E against dev (`yarn test:e2e`) | 45 passed, exit 0 |

### Three-player game on dev

A scratch Playwright script created a quiz with two questions through the admin API, joined three
players in separate browser contexts, ran start → answer → lock → advance → answer → lock →
finish, and timed how long each host action took to reach every player's screen. It also counted
the broadcast frames on each player's Supabase Realtime WebSocket. The fallback poll is 5 s, so
anything under 2.5 s on every player counts as realtime.

| Step | Slowest of 3 players |
|---|---|
| start → question 1 options enabled | 737 ms |
| lock question 1 → "Answers Locked" | 472 ms |
| advance → question 2 options enabled | 679 ms |
| lock question 2 → "Answers Locked" | 507 ms |
| finish → `state:update` with `Completed` received | 512 ms |

Each player received 6 `state:update`, 6 `leaderboard:update`, 2 `answer:ack` and 2
`question:locked` broadcasts over `wss://iwnxzdhhrreogxauxehm.supabase.co/realtime/v1/websocket`.
Final quiz status `Completed`, all three scored.

A first run that advanced 0.5 s after the lock took **10.0 s** on all three players for the
question 2 options to enable. That is not the poll fallback: the player's "answers locked" state
is the round summary, which `use-round-summary-listener.ts` clears on a fixed 10 s timer rather
than on the next question. The run above waited 11 s after the lock. Recorded in
`docs/parking-lot.md`.

## Decision: a daily keepalive

Chosen by the user on 2026-11-09 over upgrading to Pro (ADR-026). A Vercel cron
(`vercel.json`, daily within the 09:00 UTC hour) calls `GET /api/cron/keepalive`, which reads one quiz id
from the database. Vercel runs crons only on production deployments, so only `quiz-game-prod`
is kept awake; `Quiz-game-dev` may pause again and is restored by hand when needed.

## Still open

- **A game on production.** The issue's acceptance criterion is a three-player game on
  bobrquiz.vercel.app. Logging in as host there needs the owner's production credentials, so it
  runs with the owner hosting after this change deploys.
- **Whether the keepalive counts as "user database activity"** is assumed from the docs'
  wording, not observed. On 2026-11-16 (7 days), check that `quiz-game-prod` is still
  `ACTIVE_HEALTHY` and that Vercel's cron logs show a daily 200. A failing ping returns 500 and
  nothing alerts on it (no error reporting yet, issue #98); Supabase's warning email, about a
  week before a pause, is the only backstop.
