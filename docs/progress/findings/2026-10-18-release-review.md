# Release review: security, architecture and launch gaps — findings (2026-10-18)

**Ran:** a read-only review of `master` at `e39a9e0`, 2026-10-18. Code was read file by file;
every finding below cites the lines it rests on. Live checks: the dev Supabase project (`iwnx…`,
the one the project MCP server is scoped to) through `get_advisors`, `list_tables`,
`list_storage_buckets` and read-only SQL on `pg_policies`; production through one anonymous GET of
`https://bobrquiz.vercel.app/host`. Production's database, policies and Realtime settings were not
read (the MCP server cannot reach that project). Nothing was exploited: no mutating request was
sent to either environment.

## Verdict

The code builds, lints and passes its unit tests, and the layering is real at the import level.
It is not ready for a public release. The host and player trust model is missing (every
`/api/quiz/**` and player route is open), the full host state reaches players, and the live-game
write path can lose or duplicate answers under normal concurrency, while the domain lets a player
score the same question more than once.

## Checks run

| Check | Result |
|---|---|
| `yarn test:run` | 68 files passed, 1 skipped (69); 507 tests passed, 1 skipped (508). The skipped file is `src/tests/integration/add-player.integration.test.ts`, opt-in via `ENABLE_PRISMA_INTEGRATION_TESTS`. |
| `yarn lint` | 0 errors, 5 warnings (`<a>` for navigation in the admin layout, `<img>` in `question-view.tsx`, three anonymous default exports in `tests/load/`). |
| `yarn build` | exit 0. |
| Architecture sweep (`architecture-check` skill) | Clean except the 8 already-ruled presentation → infrastructure imports. Two more exist that the sweep cannot see (A3). |
| Secrets in history | Only `.env.example` is or was ever tracked. A `git grep` over all 413 revisions for JWT-like strings matched only `yarn.lock`; `sk_live`, `sb_secret_` and literal service-role patterns matched nothing (positive control matched). |
| Dev Supabase | RLS on for all 7 public tables, 0 policies on any of them; `quiz-media` bucket public, 10 MB, image MIME types; the three storage policies from the 2026-10-15 findings unchanged; 0 policies on `realtime.messages`; 2 `auth.users`; advisor: leaked-password protection off. |
| Production `/host` | HTTP 200 to an anonymous request; the page renders quizzes with their join code and a link to the host dashboard. |

## Security

| # | Finding | Evidence |
|---|---|---|
| S1 | Anyone can start, advance, lock, finish, reset (deleting all answers), retime or kick players in any quiz. | `src/proxy.ts:83-91` matches only `/admin`, `/admin/:path*`, `/api/admin/:path*`; lines 14-19 pass everything else through. `quiz/[quizId]/reset/route.ts:18-23` is `ParamsSchema.parse(await params)` then `quizService.resetQuiz(quizId)`; `start`, `advance`, `finish`, `lock-question`, `timer/reset`, `leaderboard/snapshot` and `player/[playerId]` DELETE have the same shape. No handler checks a caller. |
| S1a | Quiz ids and join codes are public. | `src/app/(host)/host/page.tsx:22-62` (outside the proxy matcher) calls `listAllQuizzes()` and renders every `joinCode` and `/quiz/${quiz.id}`. Confirmed on production. The host dashboard pages `/quiz/[quizId]` and `/quiz/[quizId]/live` are outside the matcher too. |
| S2 | `GET /api/quiz/[quizId]/state` returns the unredacted host state: every question's text and options, and every player's answers with `value` and `isCorrect`. | `state/route.ts` → `GetQuizStateUseCase` → `mapQuizToDTO` (`src/application/mappers/quiz-mapper.ts:26-50`). The redacting `mapQuizToPlayerFacingDTO` is applied only on the player-session path. |
| S3 | The same unredacted state is broadcast as `state:update` on the public `quiz:{quizId}` channel that players join; the redacted copy goes to the same channel as `state:update:player`. | `src/infrastructure/realtime/broadcast-quiz-state.ts:18-26`. The browser client's channel config has no `private: true` (`supabase-realtime-client.ts:12-16`); `src/` has no `setAuth` or `realtime.messages`; `@supabase/realtime-js` matches `payload.event` in the browser (`RealtimeChannel.js:627-649`). From the code, every player's socket receives the full frame; **not observed in a WS capture** (see "Not verified"). `channel-auth.ts` (`validatePlayerQuizAccess`) has no non-test caller. |
| S4 | Any caller can answer as, read the session of, or kick another player. | `player/answer/route.ts:9-14,45-50`: `playerId` is a body field, with no cookie or token. Player ids are `randomUUID()` but are published by `/state`, `GET /quiz/[quizId]/players` and the `players` list in the `session/join` response (`session/join/route.ts:42-47`). |
| S5 | A player can answer the same question any number of times and every correct answer scores. | `schema.prisma` `Answer` has only `@@index` on `quizId`, `questionId`, `playerId`, no unique key. `src/domain/entities/quiz.ts:113-123` pushes every submission; `:125-133` sums every correct one. The answer response carries `isCorrect`, so a player can try options until one is correct and then repeat it. The player UI says "You can adjust until the host locks it in." (`player-session-screen.tsx:208`). |
| S6 | Kicked players can keep answering and scoring. | `prisma-quiz.repository.ts:17` loads players as `{ select: { id: true } }` with no status filter and adds each to the aggregate (`:52`); `submit-answer.use-case.ts:27-30` checks only that the player exists. |
| S7 | Anyone can join any quiz by its raw id, at any status, with a name of any length. | `player/add/route.ts:7-11,37` takes `quizId`; `add-player.use-case.ts:16-33` has no status check; `playerName` is `z.string().min(1)` in both join routes. |
| S8 | Realtime events can probably be forged. | Public broadcast channels accept `send` from anon-key clients (Supabase documentation; not tried here). `use-player-session.ts:128-135` redirects to `/join?kicked=true` on `player:kicked` without checking the payload; state payloads are applied as received (`use-host-quiz-state.ts:76-78`, `use-player-session.ts:100-101`). |
| S9 | Error messages, including Prisma and Postgres ones, are returned to the client verbatim. | Every non-admin route returns `{ error: message }` with `/not found/i ? 404 : 400`. |
| S10 | The proxy logs the path of every request and the admin's email on every admin request. | `src/proxy.ts:12,49`. |

Already known and unchanged: any authenticated session can upload to and delete from `quiz-media`
(`2026-10-15-storage-policies-any-user.md`); mitigated only by disabled signups.

## Data integrity and game correctness

| # | Finding | Evidence |
|---|---|---|
| D1 | Every live-game write rewrites the whole aggregate in three statements with no transaction or version: `quiz.update`, `answer.deleteMany({ quizId })`, `answer.createMany`. Besides the lost answers in #82, two overlapping saves whose deletes both run before their inserts insert every answer twice (no unique key stops it, and `calculateScores` sums duplicates), and a read between delete and insert sees no answers. | `prisma-quiz.repository.ts:144-170`. Callers: `submit-answer:38`, `add-player:38`, `advance-question:36`, `reset-quiz-timer:32`, `lock-question:82`, start, end, reset. |
| D2 | Joining saves the whole quiz, though `save()` writes no players. A join that loaded the quiz as Pending and saves after the host's Start writes `status: Pending` back; a join during a round deletes answers saved in between. | `add-player.use-case.ts:35-38`. |
| D3 | An answer saved, then reported as failed. `broadcastAnswerAck` is awaited inside the route's only try, after the save, so a failed ack returns 400 for a stored answer; the player resubmits and, with S5, can score twice. The kick route has the same shape. | `player/answer/route.ts:46-67`; `quiz/[quizId]/player/[playerId]/route.ts:46-62`. |
| D4 | The player save after an answer writes back `status`, `score` and `rank` as loaded, and never writes `lastSeenAt`. A kick between load and save is undone; leaderboard scores written meanwhile are overwritten; "answering refreshes presence" does nothing. | `submit-answer.use-case.ts:36-39`; `prisma-player.repository.ts:59-65` (`update` lists `quizId, name, status, score, rank`). |
| D5 | Answers after the timer runs out are accepted and score until the host locks. | `Timer.hasExpired()` (`src/domain/value-objects/timer.ts:59`) has no caller; `quiz-session-aggregate.ts:155-163` refuses only on status and `answersLockedAt`. |
| D6 | Rate limits are per serverless instance, keyed on the first `x-forwarded-for` value, and set at 10 joins and 30 answers per minute. A room on one network shares an IP. The limiter's own comment makes its design acceptable "while there's no production deployment yet". | `src/lib/rate-limit.ts:1-6,66-78,159`; `session/join/route.ts:18`, `player/add/route.ts:19`, `player/answer/route.ts:29`. |
| D7 | The debounced leaderboard broadcast is a `setTimeout` that fires after the answer route has returned. Whether the platform runs it after the response is not verified. | `src/lib/debounce-broadcast.ts:63-73`, scheduled at `player/answer/route.ts:61`. |
| D8 | A missing `SUPABASE_SERVICE_ROLE_KEY` silently disables every broadcast outside development. | `supabase-server-client.ts:20-27` warns only when `NODE_ENV === 'development'`; `src/lib/env-validation.ts:34-37` marks the key optional. |

Already filed: #82 to #89 (lost concurrent answers, lost round summary, snapshots surviving a
reset, the answer box re-enabling, custom-timer scoring skew, ignored scoring setting, answers to
non-current questions, wrong route statuses), #78 to #80 (media).

## Architecture

- **No host or player identity in any layer.** ADR-005 scopes authentication to admin pages and
  admin APIs; no decision record covers who may control a quiz or act as a player.
- **One conditional write.** `lockQuestion` (`prisma-quiz.repository.ts:221-225`) is the only
  write that checks the stored state; every other live write is load, mutate, rewrite (D1, D2).
- **Rules in the presentation layer.** Removing idle players runs in the host's browser
  (`use-host-quiz-players.ts:13,127-140`: a 5-minute threshold, comparing the browser clock with
  the server's `lastSeenAt`). Scoring is implemented a second time in `src/lib/scoring-client.ts`
  without the domain's `Math.min(…, 1)` cap and `basePoints <= 0` / `timeTaken <= 0` guards
  (`scoring-strategy.ts:37-42,60-64`), so the player's points preview can disagree with the server.
- **A3: the architecture check misses `@/infrastructure` imports.**
  `src/app/(admin)/admin/layout.tsx:4` and `src/app/(admin)/login/page.tsx:5` import
  `'@/infrastructure/auth/supabase-auth-client'`; the skill's greps match only `'@infrastructure/`.
- **Three record-to-`Quiz` mappers** in `prisma-quiz.repository.ts` (`:36`, `:291`, `:326`); the
  last two pass only `timePerQuestion` and `allowSkipping` (relates to #87).
- **Error contract.** Status mapping is a different regex per route; database failures come back
  as 400, and as 404 on `sync` and player GET (`/not found|player/i` matches Prisma's
  "`prisma.player…`" messages). #89 covers the lock, start and reset routes only.
- **Tests.** Route tests exist for 3 of 24 routes (`src/tests/app/api/`: `state`, `players`,
  `lock-question`). No test covers answering twice, late answers or overlapping saves.
  `test:coverage` exists but no `@vitest/coverage-*` provider is installed. CI runs lint, unit
  tests and build; the 9 Playwright specs and `tests/load/` are not run.
- **Polling cost.** Each player polls every 5 s, and each poll loads the full aggregate plus one
  query per player (`get-player-session.use-case.ts`, `get-quiz-state.use-case.ts`), against a
  pool of 2 connections per instance (`client.ts:17`). Not measured here; R5's benchmark recorded
  join P95 of 6.29 s.

## Release readiness

- No error reporting, structured logging or health route; `plan.md` makes observability a
  pre-launch goal and PROGRESS.md's Phase 4 is unchecked.
- `yarn prisma:seed` runs `resetDatabase()` (`seed.ts:9` → `seed-helpers.ts:70`), which deletes
  every quiz, question, player and answer, with no environment guard.
- `next.config.ts` sets no headers (no CSP, no `frame-ancestors`); there is no
  `src/app/global-error.tsx`.
- No deployment runbook; `README.md` is the create-next-app text; CI has no migration or deploy
  step. `SUPABASE_URL`, `TEST_JOIN_CODE` and `TEST_QUIZ_ID` are read but documented nowhere;
  `DIRECT_URL` is missing from `SETUP.md`.

## Recorded claims this overturns

- `docs/progress/plans/2026-07-03-r6-phase5-security-hardening.md`, step 3, set out to confirm that
  the player's "network/WS payload" no longer contains other players' answers. Its recorded
  verification covers the join response and the polled player GET, both correctly redacted. It
  records no WebSocket frame, and the code (S3) still sends the full state on the channel the
  player joins.
- `PROGRESS.md:459` "RLS not enabled on Prisma-managed tables": migration
  `20260703183721_enable_rls_all_tables` enabled it, and the dev project shows it on.
- `PROGRESS.md:460` "2 remaining Dependabot alerts": the 2026-10-15 dev-deps findings leave one
  (`braces`).
- `src/lib/rate-limit.ts:5` "while there's no production deployment yet": production is live.

## Not verified

- Whether a player's socket really receives `state:update` frames (DevTools → Network → WS on
  `/play/…` while the host advances).
- Whether forged `send` on a public channel reaches other clients, and production's Realtime
  "Allow public access" setting.
- What a Prisma error returns on the deployed app.
- `login/page.tsx:20,50` passes `searchParams.get('redirect')` to `router.push` with no same-origin
  check; whether that navigates off-site needs a browser test.
- Whether `x-forwarded-for` can be spoofed past Vercel's own header.
- Production's RLS, storage policies and advisors.

## Checked and fine

- The service-role key is read only in `supabase-server-client.ts:8`, not `NEXT_PUBLIC_`, and no
  client component imports it or the broadcasters.
- Admin identity: `getUser()` then the `ADMIN_EMAILS` allowlist, case-insensitive, failing closed
  when unset (`supabase-auth-client.ts:71-90`).
- Request bodies are parsed with zod; no raw SQL outside the generated client; no
  `dangerouslySetInnerHTML`; media URLs are admin-only `z.string().url()`; upload names are
  random, so no path traversal.
- Supabase auth cookies default to `sameSite: lax`, so cross-site POST, PATCH and DELETE to admin
  routes carry no session.

## Tracking

S1 to S8 are tracked as draft repository security advisories, visible only to the repository's
admins until published (an anonymous request for each returned 404 on 2026-10-18):

| Findings | Advisory | Severity |
|---|---|---|
| S1, S1a | GHSA-j2j8-j6g6-5f29: anyone can control any quiz | critical |
| S4 | GHSA-j6mg-7jc4-3gvf: players are identified only by a playerId | high |
| S2, S3 | GHSA-rxxj-x7x9-9fh7: players receive the host's full quiz state | high |
| S8 | GHSA-jv37-f2qr-6jg6: realtime channels are public | medium |
| S5 | GHSA-rq7w-52rf-mq34: repeat answers all score | high |
| S6 | GHSA-9q49-m59r-h4pq: kicked players keep scoring | medium |
| S7 | GHSA-g2xx-cr9j-4q77: joining needs no join code | medium |

This record stays unpushed until those fixes merge, because it describes the same attacks.
