# Quiz owners: every quiz belongs to one host (issue 127)

Status: Draft, awaiting approval

## Why

The "Anyone can host" milestone ends with strangers signing up as hosts (issue 129). Today a
quiz has no owner, and the live-game controls have no login at all: anyone who knows a quiz id
can start, advance, lock, reset or finish it, list its players and kick them. Once sign-ups
open, every host could also list, edit and delete every other host's quizzes from `/admin`.

This change gives every quiz an owner and makes every host-facing page and route answer only to
that owner. It is the first link of the sign-up chain: storage lock (128), then sign-up (129),
then the landing page (130).

## Goals

- `Quiz.ownerId`, required: the Supabase auth user id of the host who created it.
- A host sees and controls only their own quizzes, in the admin UI and in a live game.
- A quiz that isn't yours behaves exactly like a quiz that doesn't exist: 404, same message.
- Players stay anonymous; joining and answering work as they do today.

## Non-goals

- **No operator view.** Support for a host's problem happens outside the app, through the
  Supabase dashboard (or SQL through the Supabase MCP) and the Vercel logs, and only when a host
  asks for help. No "admin sees everything" branch in any owner check. (Vlad, 2026-11-10;
  a read-only operator view is parked.)
- No co-hosts or shared quizzes: one owner per quiz.
- No sign-up flow, no removal of `ADMIN_EMAILS`: that is issue 129.
- No storage or media changes: the media library talks to Supabase Storage from the browser
  and is issue 128.
- No change to realtime channels (`quiz:{quizId}`, `player:{quizId}:{playerId}`); players need
  them, and quiz ids are unguessable cuids.
- No row-level-security policies. RLS is already enabled on every table with no policies, so
  the Supabase data API sees nothing; Prisma connects as a role that bypasses RLS, and ownership
  is enforced in the application.
- No audit actor tracking (`AuditLog.actorId` stays as it is).

## Anti-goals (a failure even if it works)

- A route that answers 403 for someone else's quiz, or a different message than for a missing
  one: it leaks that the quiz exists.
- A player flow that starts requiring a login.
- An owner check done only in the UI or the proxy, so the API can still be called directly.

## Who is who

- **Host:** a signed-in user. Until issue 129, only accounts in `ADMIN_EMAILS` exist (sign-ups
  are disabled in both Supabase projects). The proxy's allowlist check stays as it is and also
  covers the newly gated pages (`/host`, `/quiz/**`). The `/api/quiz/**` host routes are not
  added to the proxy: one path (`api/quiz/[quizId]/player/[playerId]`) is a host DELETE and an
  anonymous GET, so the route itself checks the user and the owner. A signed-in user outside the
  allowlist can't exist until 129, which removes the allowlist anyway. (My call.)
- **Player:** anonymous, identified by `playerId` in the URL as today.

The host runs the live screen on the same signed-in computer (Vlad, 2026-11-10), so the live
pages can require a login.

## Access rules

### Pages

| Page | Rule |
|---|---|
| `/host` (quiz picker) | signed in; lists only the user's quizzes |
| `/quiz/[quizId]`, `/quiz/[quizId]/live` | signed in and owner; otherwise `notFound()` |
| `/admin/**` | already signed in (proxy); data comes from the routes below |
| `/join`, `/play/**` | unchanged, anonymous |

Signed-out visits to `/host` and `/quiz/**` redirect to `/login` as `/admin` does now (extend
the proxy matcher).

### API routes

A host route reads the signed-in user on the server: no user → 401 `Unauthorized`; quiz not
owned by the user → 404 with the same message the use case gives for a missing quiz.

Host routes (signed in + owner):

- `api/admin/quizzes` GET (only the user's quizzes) and POST (sets `ownerId` to the user; the
  client never sends it)
- `api/admin/quizzes/[quizId]` GET, PATCH, DELETE; `.../reset` POST
- `api/admin/quizzes/[quizId]/questions` GET, POST; `.../reorder` POST
- `api/admin/quizzes/[quizId]/questions/[questionId]` GET, PATCH, DELETE: the question must
  belong to `quizId`, and `quizId` must be owned. Today these routes ignore `quizId` and look the
  question up by id only.
- `api/admin/questions` GET: only questions in the user's quizzes, with the existing
  `quizId`/`type` filters applied inside that set.
- `api/admin/audit` GET: only logs whose quiz the user owns. Logs with no quiz (`quizId` null,
  for example after the quiz was deleted) are not shown to hosts.
- `api/quiz/start` POST (quiz id in the body)
- `api/quiz/[quizId]/` `advance`, `finish`, `lock-question`, `reset`, `timer/reset`,
  `leaderboard/snapshot` POST
- `api/quiz/[quizId]/players` GET and `.../players/status` GET
- `api/quiz/[quizId]/player/[playerId]` DELETE (kick). The GET on the same path is a player
  route and stays anonymous.

Anonymous routes, unchanged: `api/session/join`, `api/player/add`, `api/player/answer`,
`api/quiz/[quizId]/state` GET (players' phones poll it), `api/quiz/[quizId]/player/[playerId]`
GET, `.../sync` POST, `.../presence` POST, `api/cron/keepalive`.

Known limit: the public `state` read returns the player list, answers and join code
(`src/application/dtos/quiz.dto.ts`), so "a quiz that isn't yours looks missing" holds for host
routes only. That relies on quiz ids being unguessable, and is accepted for this change.

## How it fits the layers

- **Reading the user:** one server-side helper in `src/infrastructure/auth/` built on the existing
  `createServerClient(cookieStore)` and `supabase.auth.getUser()`, returning the user id or
  nothing. Routes and server-component pages call it; a route with no user returns 401. Routes
  may import it alongside `getServices()` (record it in CLAUDE.md's layer exceptions, like the
  broadcasters).
- **Checking ownership:** in the application layer. Each host-facing service method / use case
  takes the caller's user id and throws the existing not-found error when the quiz is missing or
  owned by someone else, so the routes' `/not found/i` → 404 mapping covers both cases. The
  domain `Quiz` entity carries `ownerId`.
- **Repository:** the quiz repository's mapper reads and writes `ownerId`; `findAll` gives way to
  a by-owner list. Whether the owner is matched in the query or compared after loading is the
  builder's call, as long as both paths give the same error.

## Data and migration

- `model Quiz` gains `ownerId String @db.Uuid` (required) with an index. No foreign key to
  `auth.users`: Prisma doesn't model the `auth` schema, and deleting a user deleting their
  quizzes is a product decision for later. (My call.)
- Existing quizzes go to Vlad's main account in each environment (Vlad, 2026-11-10). The e2e
  account owns only what its tests create.
- Migrations are applied by hand with `prisma migrate deploy`; nothing runs them on deploy, and
  a merge to `master` deploys production automatically (ADR-019). Local dev and every PR preview
  share the `Quiz-game-dev` database (ADR-018). Because the owner's user id differs per Supabase
  project and must not be committed, the change ships in one PR as:
  1. a migration that adds `ownerId` as nullable, with the index;
  2. a one-off `package.json` script that sets `ownerId` on every quiz without one to a given
     user id (a uuid, copied from the Supabase dashboard). It needs no access to the `auth`
     schema, so it runs the same against a local copy;
  3. a second migration that makes `ownerId` NOT NULL, which fails loudly if any quiz still has
     none.
- Order (my call): during development, run migration 1 and the script on `Quiz-game-dev` only.
  This branch's code always sets `ownerId`, so it works with the nullable column, and other
  branches and previews keep creating quizzes. Right before merging: migration 2 on dev, then
  migration 1, script and migration 2 on production, then merge. Quiz creation from code without
  this change fails only between migration 2 and the deploy finishing (minutes, while Vlad is the
  only host), and on other branches until they merge `master`.
- Before running the script on dev, delete leftover "E2E fixture" quizzes there; once owned by
  Vlad's account, the e2e stale-quiz cleanup would no longer see them.
- Acceptance asks for a clean run on a copy of production data: a local Postgres restored from a
  `pg_dump` of the app tables, running migration 1, the script and migration 2, is enough.

## Things that create quizzes without a user today

- **Seeds** (`seed.ts`, `seed-launch-demo.ts`, `seed-helpers.ts`): take the owner from an env
  variable (an email or a user id), and fail with a clear message if it is unset.
- **e2e** (`e2e/support/quiz-fixtures.ts`): `createAdminApi()` already creates and starts quizzes
  with the signed-in e2e admin's session, so they own them; no change there.
  `e2e/stale-quizzes.cleanup.ts` now sees only the e2e account's quizzes, which is what it should
  delete. Every spec runs signed in (`playwright.config.ts`), so add one player join-and-answer
  test with no session, to catch a player flow that starts requiring a login.
- **Load tests** (`tests/load/*.js`, run by hand): call `/api/quiz/start` and
  `/api/quiz/[quizId]/advance` anonymously (`answer-submission-storm.js`) and use a quiz id
  hard-coded in `config.js`. They need a way to send a host session (for example a cookie passed
  in an env variable) and a quiz owned by that host; the exact mechanism is the builder's call.
  Not in CI.

## Acceptance (from the issue)

- This spec approved.
- Route tests: host B gets 404 on host A's quiz for list (absent from it), read, update, delete,
  start, advance, lock, reset, and the question routes; and 401 with no session. (Media has no
  route; issue 128 covers it.)
- Use case tests cover owner and non-owner paths.
- The migration applies cleanly on a copy of production data.
- The player join and answer flows still pass e2e, including one run with no session.
- `yarn test:run`, `yarn lint`, `yarn build` pass; `yarn test:e2e` runs because flows change.

## Left to the builder

- The helper's name and return type, and how routes share the 401 response.
- Whether each use case gains an owner argument or a single "load owned quiz" step guards them.
- Test layout, as long as it follows the repo's testing table.
- How the e2e and load-test sessions are wired.
