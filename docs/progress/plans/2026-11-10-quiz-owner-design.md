# Quiz owners: every quiz belongs to one host (issue 127)

Status: ✅ Complete — PR #141, #143, #144, #150, #151

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
  account is the main account (`TEST_ADMIN_EMAIL`, the one that owns the backfilled quizzes), so
  the quizzes its tests create are owned by that account; `e2e/stale-quizzes.cleanup.ts` deletes
  only the "E2E fixture" quizzes it sees there.
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
  `e2e/stale-quizzes.cleanup.ts` now sees only the signed-in account's quizzes (the main
  account, which also owns the backfilled ones; the cleanup deletes only "E2E fixture" titles).
  Every spec runs signed in (`playwright.config.ts`), so add one player join-and-answer
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

## Rollout runbook

Which database a command hits is decided by `DATABASE_URL` (the backfill script and
`db execute` through the client) and `DIRECT_URL` (migrations: `prisma.config.ts` uses
`DIRECT_URL`, falling back to `DATABASE_URL`). Both `prisma.config.ts` and the script load only
`.env`, which this repo does not have: `.env.local` holds the dev values and is not read by
them. So export both variables for the target environment in the shell before every command
(shell variables win over dotenv), from the Supabase dashboard of that project:

```bash
export DATABASE_URL='<target pooler url>' DIRECT_URL='<target direct url>'
# Print username and host of each URL (no password; the host is the text after the LAST @,
# so a password containing @ does not leak). The project ref must be the same in both URLs: it
# appears as postgres.<ref> in a pooler username or as db.<ref> in a direct host.
for u in "$DATABASE_URL" "$DIRECT_URL"; do echo "$u" | sed -E 's#^[a-z]+://([^:]*):.*@([^@]*)$#\1@\2#'; done
```

Start the `export` line with a space (zsh `HIST_IGNORE_SPACE`) or load the values from a file, so
the URLs do not land in shell history.

### During development (dev only)

0. List the leftover "E2E fixture" quizzes, and delete them only after Vlad says yes (they have
   no owner and would otherwise be handed to the real owner):
   `SELECT id, title FROM "Quiz" WHERE title LIKE 'E2E fixture %';` in the Supabase SQL editor.
   After the yes, delete by the listed ids:
   `DELETE FROM "Quiz" WHERE id IN (...) AND title LIKE 'E2E fixture %';`. Child rows cascade
   (players, answers, questions, snapshots); audit logs keep their rows with `quizId` set to null.
1. Apply migration 1 alone (nullable column and index), then mark it applied. `db execute` takes
   no `--schema` flag in Prisma 7.10.1 (it fails), and `&&` keeps a failed execute from being
   recorded as applied:
   ```bash
   yarn -s prisma db execute --file ./src/infrastructure/database/prisma/migrations/20261110100000_add_quiz_owner/migration.sql \
     && yarn -s prisma migrate resolve --schema ./src/infrastructure/database/prisma/schema.prisma --applied 20261110100000_add_quiz_owner
   ```
2. Backfill: copy the owner's user id from the Supabase dashboard (Authentication > Users), then
   ```bash
   yarn quiz:assign-owner <owner-user-id>
   ```
   It prints how many quizzes it changed and how many still have no owner (must be 0). A value
   that is not a uuid exits non-zero and changes nothing.

Do not run migration 2 on dev yet.

### Right before merge

Dev first, then production, each with its own exported URLs:

3. Dev: apply migration 2 (`SET NOT NULL`; it fails if any quiz still has no owner):
   ```bash
   yarn prisma migrate deploy --schema ./src/infrastructure/database/prisma/schema.prisma
   ```
4. Production: step 1 (migration 1 and `migrate resolve`), step 2 (the backfill with the
   production owner's user id), then step 3 (`migrate deploy`).
5. Merge the PR.
