# E2E isolated quizzes — design

**Date:** 2026-10-15
**Status:** ✅ Complete — PR #110
**Branch:** `test/e2e-isolated-quizzes` (from `origin/master` at eddd33f)

## Why

Master's E2E suite has 15 failing tests (the 16 known failures minus the invalid-credentials test
fixed by the separate auth-spec account). Investigation on 2026-10-15 split them into two causes.

**1. One shared, mutated quiz (12 tests).** Every host and player spec uses the seeded quiz with
join code JOIN-KYTX ("Trivia Night Demo"). `e2e/quiz.setup.ts` only looks it up (by joining it as
a throwaway player) and never resets it. The round-transitions "advance" test clicks Next
question on every run, the host-dashboard test starts it, and everything runs with
`fullyParallel: true`. After a few runs the quiz reached its end and stayed Completed:

- Host dashboard (2) and round transitions (4) wait for a Pending or Active badge in the banner.
- Player reconnection (5) needs an Active quiz whose current question is free text (only question
  4 is); on a Completed quiz the answer box is disabled.
- Admin quiz list, "should not show edit/delete buttons for active quiz", needs "Trivia Night
  Demo" to be Active.

Evidence: after resetting the quiz to Pending through `POST /api/quiz/{id}/reset`, those specs
went from 12 failures to 7. The 7 then failed on the coupling itself: reconnection found no
textbox at question 1 (multiple choice), and "disable Lock Question after locking" saw Lock
re-enabled while the parallel "advance" test moved the same quiz on. Each run also adds one
"E2E-Setup-…" player to the quiz, and the reconnection tests add five more.

> **Correction (2026-10-15, plan check and root-cause investigation):** the "disable Lock Question
> after locking" failure is not caused by the shared quiz. The lock is never saved
> (`prisma-quiz.repository.ts:144-171` writes no Question, `prisma-question-mapper.ts:20-39` drops
> `answersLockedAt`), so Lock re-enables after every refetch, on an isolated quiz too. Fixed on its
> own branch, `fix/persist-answer-lock` (user's choice, option B); the two lock tests here pass
> only once that is merged. Likewise "createdAt more than 30 minutes old" in Design 3 cannot work:
> the quiz list returns the request time as `createdAt`; the plan's sweep reads the age from the
> fixture title instead (plan, deviation 6).

**2. Tests behind the UI (4 tests; the host-dashboard one is also among the 12).**
- `host-dashboard.spec.ts:74`: `getByText(/\d{2}:\d{2}/)` matches two elements.
- `player-connection-status.spec.ts:121`: `getByText('Connected')` also matches the newer
  "1 connected" summary (text match is case-insensitive and substring by default).
- `player-connection-status.spec.ts:23-29`: `page.goto` runs before `page.route` installs the
  mock, so the first players fetch can return real players.
- `player-connection-status.spec.ts:186`: waits for "Failed to load player connection status";
  the app now renders the standard 404 page for an unknown quiz id.

## Decisions

- **Each test that needs a quiz creates its own** (user's choice, option (a), 2026-10-15) over
  resetting the shared quiz and running the stateful specs serially (option (b)), which keeps the
  tests coupled through order and question index.
- **One quiz per test, not per file.** With `fullyParallel`, tests in one file run in parallel
  too; a per-file quiz brings the races back.
- **The four drift fixes ride on this branch**, so the branch's goal is "E2E green".
- **Out of scope:** `POST /api/quiz/{id}/reset` (and the other host routes under `/api/quiz/`)
  work without a login (`src/proxy.ts` matches only `/admin` and `/api/admin`). A product and
  security change; recorded as its own item.

## Facts the design relies on

Read from the code on 2026-10-15:

- Create quiz: `POST /api/admin/quizzes`, body `{ title, timePerQuestion?, allowSkipping? }`
  (`src/application/dtos/quiz-admin.dto.ts:7-13`), 201 `{ id }`.
- Add question: `POST /api/admin/quizzes/{id}/questions`, body `{ text, type: 'multiple-choice' |
  'text' | 'true/false', options?: string[], correctAnswers: string[], points? }`
  (`question-admin.dto.ts:54-65`); appended in call order. Any quiz status is accepted.
- Join code: generated on create; the quiz state DTO carries `joinCode`
  (`src/application/dtos/quiz.dto.ts:46`).
- Start: `POST /api/quiz/start` `{ quizId }`; only a Pending quiz starts (`quiz.ts:89-91`).
- Reset: `quiz.reset()` accepts Active or Completed only, sets Pending (`quiz.ts:138-150`).
  `POST /api/admin/quizzes/{id}/reset` needs the admin session.
- Delete: `DELETE /api/admin/quizzes/{id}`; an Active quiz is refused
  (`delete-quiz.use-case.ts:14`). Questions, players, answers and leaderboard snapshots cascade
  (`schema.prisma`, `onDelete: Cascade`); audit-log rows keep the event with `SetNull`.
- Auth: `/api/admin/*` needs the admin session; `src/proxy.ts` does not cover `/api/quiz/*` or
  `/api/session/join`. The chromium project's `storageState` is `playwright/.auth/user.json`.
- Join rate limit: `POST /api/session/join` allows 10 requests per 60 s per client IP, kept in
  the dev server's memory (`src/app/api/session/join/route.ts:17-20`, `src/lib/rate-limit.ts`).
  All local tests share one IP.

## Design

### 1. Quiz fixture helper

New `e2e/support/quiz-fixtures.ts`:

- `createAdminApi(playwright)`: `playwright.request.newContext({ baseURL, storageState })` with
  the admin session, created once per test file (`beforeAll`) and disposed in `afterAll`.
- `createTestQuiz(api, { label, questions, start })` → `{ id, joinCode, title }`:
  creates the quiz titled `E2E fixture <label> <timestamp>`, adds the questions in order, reads
  the join code back, and starts the quiz when `start` is true.
- `deleteTestQuiz(api, id)`: resets the quiz when it is Active, then deletes it.
- Every request checks the response and throws with the method, path, status and body. (Today
  `admin-question-crud.spec.ts:8-25` ignores a failed create.)
- Question presets: a free-text question, the multiple-choice "What is the capital of France?"
  (options Paris, London, Berlin, Rome; answer Paris) and a true/false question. 2026-10-18: the
  true/false preset was dropped in the branch passes; no spec used it.

### 2. One quiz per test

Each test that needs a quiz creates it in `beforeEach` and deletes it in `afterEach`:

| Spec | Quiz |
|---|---|
| `host-dashboard.spec.ts` | Pending, France question plus one more |
| `round-transitions.spec.ts` | Active, two multiple-choice questions; the "if Pending, click start" branches go |
| `player-reconnection.spec.ts` | Active, first question free text |
| `admin-quiz-crud.spec.ts`, active-quiz test | Active, asserted by its unique title |
| `player-join.spec.ts` | Active |
| `player-connection-status.spec.ts` | Pending (only the page needs to load; players are mocked) |
| `admin-question-crud.spec.ts` | its existing per-test create moves to the helper |

Assertions on "Trivia Night Demo" assert the created title instead.

Removed: `e2e/quiz.setup.ts`, `getQuizId()` / `getJoinCode()` / `getQuizInfo()` in
`e2e/fixtures.ts`, the `TEST_JOIN_CODE` and `TEST_QUIZ_ID` fallbacks, and the
`playwright/.quiz-info.json` file. The seeded JOIN-KYTX quiz stays in the seed as demo data; E2E
no longer touches it.

### 3. Leftovers

- A setup step after authentication deletes quizzes whose title starts with `E2E fixture ` and
  whose `createdAt` is more than 30 minutes old, so a crashed run's quizzes do not pile up and a
  run in progress elsewhere (the other machine, same dev database) is left alone.
- Data left by earlier runs without the prefix ("Question CRUD Test …" quizzes, quizzes created
  by the admin specs, the extra players on JOIN-KYTX) is a one-off cleanup in the dev database,
  listed for the user's approval, not code.

### 4. Tests behind the UI

- Host dashboard: scope the timer assertion to the timer element.
- Connection status: `getByText('Connected', { exact: true })`; install every `page.route` mock
  before `page.goto`; the not-found test expects the 404 page.

### 5. Join rate limit

Tests that join through the UI (player-join and the five reconnection tests) make about seven
joins per run, under the limit of 10; retries can exceed it. Removing the setup's lookup join
saves one. Recorded as a risk: the verification checks for 429 responses, and it is handled only
if one appears.

2026-10-18, branch passes: three of the five reconnection tests asserted only what the other two
already did and were dropped, so a run now makes 4 join requests (player-join's two, the
reconnection tests' two). Every join asserts the response, so a 429 fails with its body.

### 6. Database pool size from the environment (added 2026-10-18)

Measured cause of the full-run failures after Task 4
(`docs/progress/findings/2026-10-18-e2e-db-pool-queueing.md`): the Prisma pg adapter pool is
`max: 2`, which caps the dev server at ~43 statements/s, and per-test quizzes plus polling exceed
it. User's choice (2026-10-18, of: env pool size, fewer workers, fewer queries per quiz):

- `client.ts` takes the pool size from `DATABASE_POOL_MAX` through a pure helper
  (`resolvePoolMax`): unset or empty → 2, so Vercel keeps today's pool; a positive integer → that
  value; anything else throws when `client.ts` first loads (a typo must not silently fall back).
  In dev that is the first request to a route or page that imports the services factory (which
  imports the client), even one that never queries, not server start; whether
  `next build` loads it, and so fails the build, is unverified.
- `.env.example` documents it; a dev machine sets 10 in `.env.local` or `.env.development.local`
  (a pool of 10 stayed flat at 8 concurrent creates). Each dev server then holds up to 10 of the project's 60 connections.
- Not chosen: fewer Playwright workers (the ceiling stays; headroom unmeasured) and fewer
  statements per quiz (an API contract change or a preview Prisma feature; its own work).

### 7. Join rate limit from the environment (added 2026-10-18)

Section 5's risk appeared in Task 5: two full runs back to back (run 1 took 28 s) put ~14 UI joins
into one 60 s window, and the four reconnection tests got 429 "Too many requests" (they passed on
retry). User's choice (2026-10-18, of: an env override, or docs telling people to wait a minute):

- `POST /api/session/join` reads its limit from `SESSION_JOIN_RATE_LIMIT` through a pure helper
  `resolveRateLimit(value, fallback, name)` in `src/lib/rate-limit.ts`: unset or blank → the
  fallback (10, today's limit, so production is unchanged); a positive integer → that value;
  anything else throws when the route module loads, naming the variable in the message, so every
  join returns 500 until the value is fixed (the E2E join helper reports that body). The
  window stays 60 s; add-player and submit-answer keep their limits (no E2E run reaches them).
- `.env.example` documents it; this worktree's `.env.development.local` sets 100.
- Same parsing rule as `resolvePoolMax` (section 6), written twice on purpose: infrastructure
  cannot import `src/lib`, and a shared module for two six-line helpers costs more than it saves.
- The limiter's trust in `x-forwarded-for` is the separate security item; this change does not
  touch key derivation.

## Testing and verification

- No unit test for the quiz fixture helper: it is E2E support code, exercised by every spec that
  uses it. (The pool-size helper of section 6 is application code and has its own unit test.)
- Two full `yarn test:e2e` runs back to back. The second shows that nothing carries over between
  runs. Target: 0 failures; anything left failing gets its own cause, not a retry.
- No 429 response in either run.
- After the runs, the dev database holds no `E2E fixture` quizzes younger than the sweep limit
  other than ones from a run in progress.
- `yarn lint` and `tsc` pass; `yarn test:run` unchanged (no app code changes). 2026-10-18:
  overtaken by sections 6 and 7, which change `client.ts` and the join route and add unit tests
  (507 → 522).

## Out of scope

- Unauthenticated host routes under `/api/quiz/` (separate security item).
- The join rate limiter trusting `x-forwarded-for` (spoofable; part of the same review).
- Changing the seed or the demo quiz.
