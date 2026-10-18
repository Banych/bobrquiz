# Silent-failure hunt: test/e2e-isolated-quizzes

Range `e39a9e0..23140ab` (HEAD at hunt time `ecdad04`, one docs-only commit past the range).
Report only; nothing changed except this file.

Totals: Critical 0, High 0, Medium 2, Low 5.

## Findings

### S1 (Medium): a join 429 shows up as a `waitForURL` timeout, and the default retry turns it into exit 0

- **Where:** `e2e/player-reconnection.spec.ts:24-33` (`joinAsPlayer`), `e2e/player-join.spec.ts:32-41`,
  `playwright.config.ts:16` (`retries: process.env.CI ? 2 : 1`), `CLAUDE.md:195-197` (pitfall 5).
- **Hidden failure:** both join paths click "Join quiz" and then wait up to 30 s for `/play/...`. Nothing
  checks the `POST /api/session/join` response. When the limiter returns 429, the form shows "Too many
  requests, please slow down." and the test fails with a bare `page.waitForURL: Timeout 30000ms
  exceeded`, which says nothing about the rate limit. The retry runs in a new 60 s window or after the
  window resets, so it passes, and the run ends "N flaky, exit 0".
- **Scenario (already observed twice):** the ledger's Task 4 notes "4 player-reconnection failures
  (waitForURL in joinAsPlayer), cause unknown". In Task 5, run 2 reported "4 flaky, 44 passed, exit 0", and
  the 429 was only found by grepping the error contexts for "Too many requests". The same thing happens
  when `SESSION_JOIN_RATE_LIMIT` is missing, misspelled or not loaded by a reused server (S3). A
  join-route regression that fails only some of the time would also come back green.
- **Doc mismatch:** CLAUDE.md pitfall 5 says the suite "fails" with the default limit. With the default
  retries, what was measured was a pass marked flaky (exit 0).
- **Fix:**
  1. In both join paths, wait for the join response and assert on it, so a 429 or 500 fails right away with
     the status and body in the message:
     ```ts
     const [joinResponse] = await Promise.all([
       page.waitForResponse((r) => r.url().endsWith('/api/session/join')),
       page.getByRole('button', { name: /join quiz/i }).click(),
     ]);
     expect(joinResponse.status(), await joinResponse.text()).toBe(200);
     ```
     `joinAsPlayer` could move to `e2e/support/` so player-join uses the same helper.
  2. For verdict runs, use `--fail-on-flaky-tests`, or `failOnFlakyTests: true` in the config (both are
     available in the installed Playwright 1.64.1, `types/test.d.ts:1324`), or `--retries=0`. Then a test
     that only passed on retry makes the run exit non-zero.
  3. Change pitfall 5 to "fails, or passes as flaky on retry".

### S2 (Medium): the "invalid join code" test passes when the join route crashes

- **Where:** `e2e/player-join.spec.ts:72` (`getByText(/not found|invalid|unable/i)`), together with
  `src/components/player/player-join-form.tsx:105-110` and `src/app/api/session/join/route.ts:12-16`.
- **Hidden failure:** when a non-OK response has no JSON body, the form falls back to the message "Unable
  to join the quiz.". The test's regex accepts `unable`, so any 500 also passes it. This branch adds a new
  way to get that 500. `resolveRateLimit` runs when the route module loads, so a bad
  `SESSION_JOIN_RATE_LIMIT` (`100/min`, `1e2`, `0`) makes the module throw on import. Next then answers
  every join with an HTML 500.
- **Scenario:** a developer sets `SESSION_JOIN_RATE_LIMIT=1e2`. Every join returns a 500. "should show
  error when join code is invalid" passes. The join and reconnection tests fail with the bare 30 s
  `waitForURL` timeout from S1, and the response that explains it is never asserted. The assertion line
  itself is older than this branch, but the failure mode it now hides comes from this branch.
- **Fix:** assert the domain's own not-found response rather than any error text:
  ```ts
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/session/join')),
    page.getByRole('button', { name: /join quiz/i }).click(),
  ]);
  expect(res.status()).toBe(404);
  await expect(page.getByText(/was not found/i)).toBeVisible();
  ```
  The use case throws "Quiz with the provided join code was not found.", and the route maps it to 404.

### S3 (Low): a missing or misspelled limit silently uses the default, and nothing shows which value the server is running with

- **Where:** `src/infrastructure/database/prisma/pool-size.ts:9`, `src/lib/rate-limit.ts:35`,
  `playwright.config.ts:54` (`reuseExistingServer: !process.env.CI`).
- **Hidden failure:** falling back to the default when the variable is unset was a deliberate spec choice
  (sections 6 and 7) and is right for production. The cost is that a variable that is misspelled
  (`SESSION_JOIN_RATE_LIMT=100`, `DATABASE_POOL_MAX` in a file this server does not load) or added after
  the dev server started (Playwright reuses whatever is listening on :3000) looks exactly like "unset". The
  server never prints the effective value. The symptoms appear somewhere else: pool queueing shows up as
  15 s `POST /api/admin/quizzes` timeouts inside `createQuiz` (Task 4's full run), and the join limit shows
  up as S1.
- **Fix (cheap):** log the effective value once at module load in development, for example
  `if (process.env.NODE_ENV === 'development') console.info(\`[config] DATABASE_POOL_MAX=${max}${raw ? '' : ' (default)'}\`)`,
  and the same for the join limit. A misspelled variable then shows up as "(default)" in the dev-server
  log on the first DB or join request. Optionally, add a line to `e2e/README.md` telling people to check
  that log line before a verdict run.

### S4 (Low): the sweep deletes any "E2E fixture …" title that ends in a number

- **Where:** `e2e/support/quiz-fixtures.ts:139-142` (`/\s(\d+)(?:-[^\s]+)?$/`), with the age check at
  `:159`.
- **Hidden failure:** any run of digits is read as a millisecond timestamp. I checked this with node:
  `"E2E fixture round 2"` gives `2`, `"E2E fixture demo 2024"` gives `2024`, and `"E2E fixture x 5-bar"`
  gives `5`. All of those count as 55 years old, so every run's cleanup project deletes them (an Active one
  is reset first) and counts them in "deleted N stale fixture quizzes", with no warning that they weren't
  real fixture timestamps.
- **Scenario:** someone demoing the fixture convention in the shared dev database creates "E2E fixture
  walkthrough 1". The next E2E run deletes it.
- **Fix:** match only the shapes the code actually writes, 13 digits with an optional 4-character base-36
  suffix: `/\s(\d{13})(?:-[a-z0-9]{4})?$/`. Also skip any timestamp in the future or older than a sanity
  floor (for example, before 2025).

### S5 (Low): the sweep skips untimed fixture titles without saying how many

- **Where:** `e2e/support/quiz-fixtures.ts:159` (`if (createdAt === null || createdAt >= cutoff) continue;`),
  `e2e/stale-quizzes.cleanup.ts:9`.
- **Hidden failure:** a fixture-prefixed quiz whose title doesn't parse is never deleted, and nothing is
  logged. Keeping it is correct, since it isn't provably stale. But if a future spec or a page object leaks
  prefixed quizzes in that shape (as the update test would have before Task 4's departure), they pile up
  while the log line keeps reporting a normal-looking count.
- **Fix:** return `{ deleted, skippedUntimed: string[] }` and have the cleanup test log the skipped titles,
  or at least their count.

### S6 (Low, uncertain): a bad env value may be caught on the first request, not at deploy

- **Where:** `src/app/api/session/join/route.ts:12-16` and `src/infrastructure/database/prisma/client.ts:19`.
  Both parse at module scope.
- **Hidden failure:** spec section 6 says "anything else throws at startup". In practice the throw happens
  when the module is first imported. If `next build` imports these modules (it usually does for route
  handlers during "Collecting page data", and `client.ts` already depends on that for `DATABASE_URL`), a
  bad value fails the build loudly. If a value changes only at runtime, or the modules load lazily under
  `next start`, a deploy looks healthy and then every join (or every DB call) returns a 500. A player sees
  only the generic "Unable to join the quiz.". **Uncertain:** I did not run a build to confirm when Next
  16.3.8 evaluates these modules.
- **Fix:** none needed if a build confirms the import happens at build time. Record that in the spec in
  place of "at startup". Otherwise, read both values in `instrumentation.ts` `register()`, which runs once
  when the server boots, so a bad value stops the server from starting.

### S7 (Low): two reconnection tests promise more than they check

- **Where:** `e2e/player-reconnection.spec.ts:117-130` ("should show reconnecting state during sync") and
  `:80-98` ("should auto-reconnect when network returns"). Both helpers are at `:35-40` (`setOnline`).
- **Hidden failure:** the first test asserts only the end state (answer box enabled). It would pass if the
  reconnecting or sync state never appeared at all. Both tests fake the network through `navigator.onLine`
  and window events, while the realtime socket and fetches stay up, so neither one exercises an actual
  resubscribe or sync. Both are older than this branch (the original comment admits the reconnecting state
  is too brief to assert). The ledger already deferred the overlap between these tests to the
  simplification report. This finding is about the names: a passing "reconnecting state" test reads as
  coverage that does not exist.
- **Fix:** either assert the intermediate state by delaying the sync request with `page.route` so
  "Reconnecting…" stays visible, or rename the tests to what they actually check ("re-enables input after an
  offline/online event").

## Checked and fine

- **`resolvePoolMax` and `resolveRateLimit` parsing:** whitespace is trimmed (`" 4\n"` gives 4). Blank
  falls back to the default. `0`, `-1`, `2.5`, `ten`, `10abc`, `1e2` and `+5` throw with the variable name
  and the bad value. `0010` gives 10, which is harmless. Unit tests pin all of this
  (`pool-size.test.ts`, `rate-limit.test.ts`).
- **Absurdly large values** (`99999999999999999999` parses to 1e20, which means no rate limit or an
  unbounded pool): already ruled twice in the ledger (Task 4b, Task 5b) with documented costs. Not raised
  again.
- **`call()`** in `quiz-fixtures.ts:65-82` checks `response.ok()` on every request and throws with the
  method, path, status and body. A 401 or 403 from `src/proxy.ts` for `/api/admin/*` is JSON, not a
  redirect, so an expired session fails loudly rather than following a redirect to `/login`.
- **`createTestQuiz` failure path:** it deletes the partly built quiz and rethrows the original error. A
  failed cleanup is a `console.warn`, and the 30-minute sweep is the backstop (ruled in Task 1).
  `joinCode` null or missing throws explicitly.
- **`deleteTestQuiz`** accepts a 404 only when the quiz is gone. The quiz id is a cuid string, so
  `findById` on an unknown id returns null and gives a clean 404, not a 500. An Active quiz is reset
  first. A DELETE refused for any other reason (400 or 500) throws. A missing `id` in the create response
  (`id === undefined`) would be treated as "already gone" during cleanup, but the thrown error shows
  `/undefined/` in the path. The ledger ruled the unchecked `JSON.parse ... as T` casts (Task 1).
- **Fixture teardown** tries every quiz, then throws one `AggregateError` that lists each failure. A
  teardown failure fails the test and does not pass silently.
- **The sweep** tries every delete and then throws an `AggregateError`, which fails the cleanup project and
  so stops every chromium test from running ("did not run"). That is loud, not silent. The trade-off (one
  undeletable stale quiz blocks the suite) is known from Task 1's round 2. The list endpoint has no
  pagination (`findAll` with no `take`), so the sweep sees every quiz. The `[CLEANUP]` log line shows up in
  the terminal: Playwright adds a stdio reporter when only `html` is configured, and the ledger quotes the
  line from a real run.
- **Cleanup project wiring:** chromium depends on cleanup, and cleanup depends on setup. A setup failure
  stops both. `createAdminApi` throws if `playwright/.auth/user.json` is missing.
- **Spec assertions checked for vacuous passes:**
  - Every `not.toBeVisible` in the new reconnection code comes after a `toBeVisible` on the same locator.
  - In admin-quiz-crud's Active test, `hasEditButton` (an instant `isVisible`) and `toHaveCount(0)` run
    only after the row's exact "Active" badge is visible, so the row exists.
  - The banner `/Pending/` and `/Active/` checks can't match the fixture title (lowercase base-36 suffix,
    lowercase labels).
  - `getByRole('timer')` exists (`timer-countdown.tsx:103`).
  - The `/lock question/i` locator can't match "Locking…", so it can't pass on the wrong button.
  - Route mocks are installed before `goto`, and later handlers take precedence.
  - `quiz-fixtures.spec.ts` has real negative cases: a failed step must match `questions failed: 400` and
    leave no quiz behind, and an untimed title must survive a sweep with `olderThanMs: 0`.
- **No `.catch(() => {})`, no `test.skip` or `.fixme`, no `waitForTimeout`** in changed spec code. The
  branch removed three `waitForTimeout(2000)` calls. The only remaining one (`admin-auth.spec.ts:159`) and
  the `catch {}` in `auth.setup.ts:47` are older than this branch and outside the range.
- **The `data-testid` on the player card** is additive only.

## Evidence

- `git rev-parse HEAD`: `ecdad04555a10cae7c2af54fa84dc23e58395f3d`. `git status --porcelain`: empty
  before this file was written.
- `git diff --stat e39a9e0..23140ab`: 37 files, +2756/−673. I read every changed src, e2e and config file
  in full, plus `src/proxy.ts`, the admin quiz routes (list, get, delete, reset), the
  get-state/delete/reset/list use cases, `Quiz.reset()`, `player-join-form.tsx:90-140`, the spec, the
  ledger, `e2e/README.md` and CLAUDE.md pitfall 5.
- `yarn test:run`: exit 0. Test Files 69 passed, 1 skipped (70). Tests 522 passed, 1 skipped (523).
- `yarn lint`: exit 0. 0 errors, 5 warnings, all in files this branch does not touch
  (`src/app/(admin)/admin/layout.tsx`, `src/components/host/live/question-view.tsx`, `tests/load/*.js` ×3).
- Node probe of the title regex and the parse rule:
  - `"E2E fixture round 2"` → 2
  - `"E2E fixture demo 2024"` → 2024
  - `"E2E fixture x 5-bar"` → 5
  - `"E2E fixture host 1760000000000-ab12"` → 1760000000000
  - `"99999999999999999999"` passes `/^\d+$/` → 1e20
  - `"0010"` → 10
- `node_modules/playwright/types/test.d.ts:1324` declares `failOnFlakyTests` (Playwright 1.64.1).
- Not run, per the brief: `yarn test:e2e`, `yarn dev`, Supabase. S1's observed behaviour is cited from the
  ledger's Task 4 and Task 5 entries. S6 is unverified.
