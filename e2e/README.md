# E2E Testing Setup

This directory contains Playwright end-to-end tests for the Bobr Quiz application.

## Authentication Setup

Tests that require admin access (Quiz CRUD, Question CRUD) use a global authentication setup:

1. **`auth.setup.ts`** - Runs before all tests: signs the test host in through the email link's
   confirm page, with a link from the service-role key's `generateLink` (no email is sent)
2. **`playwright/.auth/user.json`** - Stores the session state (gitignored)
3. Projects run in the order `setup` → `cleanup` → `chromium`; `chromium` uses the saved auth state

## Environment Variables

Add these to your `.env.local` file:

```bash
# Signs the test hosts in (generateLink) and deletes sign-up users; dev project only
SUPABASE_SERVICE_ROLE_KEY="..."

# Cloudflare's always-pass test site key for the sign-in form's bot check
NEXT_PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"

# Test host (any confirmed Supabase user can host); no password, hosts sign in by email
TEST_ADMIN_EMAIL="your-test-user@example.com"

# Second host, used by admin-auth.spec.ts and yarn media:check-non-owner
TEST_AUTH_ADMIN_EMAIL="your-auth-test-user@example.com"
```

No test sends a real email. A spec that uses the sign-in form answers its send request in the
browser (`interceptSignInEmail` in `support/email-sign-in.ts`) and then asks `generateLink` for
the code: a newer link or email voids the older code, so the send must never reach Supabase.

`admin-auth.spec.ts` has its own account because its logout test signs out every session of
the user it signs in as (Supabase's `signOut()` defaults to the global scope). With the shared
account it would revoke the session the other admin tests use, and they would land on `/login`.
The spec refuses to run if the two emails are the same; without `TEST_AUTH_ADMIN_EMAIL` its
sign-in tests are skipped.

The dev server the tests run against also needs two limits raised. Set them in `.env.local`, or in
a `.env.development.local` that Next loads over it in dev, then restart the dev server:

```bash
# Prisma pool: the default 2 caps the server at ~43 queries/s and the parallel suite queues past
# its 15 s request timeout (docs/progress/findings/2026-10-18-e2e-db-pool-queueing.md)
DATABASE_POOL_MAX=10

# Join limit: a run makes 4 join requests (more with retries), so a few runs within a minute
# exceed the default 10 per 60 s per IP and the joins get 429s. Local only; never raise it when
# deployed.
SESSION_JOIN_RATE_LIMIT=100
```

## Creating a Test User

Nothing to create by hand: the first `generateLink` for an address creates the user, and
signing in with its link or code confirms it. An existing account keeps its id (and its quizzes).

The dev Supabase project needs email sign-in set up as in
`docs/progress/plans/2026-11-14-host-signup-design.md` ("Dev project settings"); its captcha
check uses Cloudflare's always-pass test secret, which `generateLink` does not go through.

## Running Tests

```bash
# Run all E2E tests (includes auth setup)
yarn test:e2e

# Run specific test file
yarn test:e2e e2e/admin-question-crud.spec.ts

# Run tests with UI mode (interactive debugging)
yarn test:e2e:ui

# Debug mode (headed browser, slow motion)
yarn test:e2e:debug

# View last test report
yarn playwright show-report
```

## Test Structure

- **`auth.setup.ts`** - Global authentication setup (runs first)
- **`admin-auth.spec.ts`** - Sign-in by code and by email link, wrong code, used link, logout and redirect tests (own account, `TEST_AUTH_ADMIN_EMAIL`)
- **`host-signup.spec.ts`** - A new address signs up through the form, sees no quizzes, creates and starts one; and a password session of a confirmed account is refused (the users are deleted afterwards)
- **`support/email-sign-in.ts`** - `generateLink` sign-in helpers, the send intercept, and sign-up user cleanup
- **`support/quiz-fixtures.ts`** - `createQuiz` fixture: each test that needs a quiz gets its own, created through the admin API and deleted after the test (titles start with `E2E fixture `)
- **`stale-quizzes.cleanup.ts`** - `cleanup` project: deletes fixture quizzes and `e2e-signup-` users older than 30 minutes, left by crashed runs
- **`quiz-fixtures.spec.ts`** - Tests for the fixture itself
- **`host-dashboard.spec.ts`** - Host quiz control panel tests
- **`player-join.spec.ts`** - Player join flow tests
- **`admin-question-crud.spec.ts`** - Question CRUD tests (requires auth)
- **`admin-quiz-crud.spec.ts`** - Quiz create, update and delete tests, and no edit/delete buttons on an active quiz
- **`round-transitions.spec.ts`** - Lock Question button, round summary dialog, and lock/advance state changes
- **`player-reconnection.spec.ts`** - Player offline banner with answering disabled, then the banner clearing and answering re-enabled when the network returns
- **`player-connection-status.spec.ts`** - Host view of player connection status, status transitions, API errors and quiz not found
- **`supabase-clients.spec.ts`** - No duplicate GoTrueClient on the home page (anonymous) or the admin quizzes page (admin)

## Debugging Tips

1. **Auth failures**: Check that `SUPABASE_SERVICE_ROLE_KEY` belongs to the dev project the
   server uses, and `TEST_ADMIN_EMAIL` is set (for `admin-auth.spec.ts`: `TEST_AUTH_ADMIN_EMAIL`;
   its sign-in tests skip when it is unset)
2. **Timeout errors**: Increase timeout in `playwright.config.ts` or specific tests
3. **Flaky tests**: Use `page.waitForURL()`, `page.waitForSelector()`, or `expect().toBeVisible()` to wait for async operations. A test that passes only on its retry still fails the run (`failOnFlakyTests`): find its cause rather than rerunning
4. **View test traces**: After failure, open HTML report and click on failed test to see trace viewer
5. **Strict-mode violations on error text**: In dev, Next's error overlay repeats `console.error` text, so an unscoped `getByText` can match twice depending on timing. Scope it to the element that shows the error (`page.locator('form').getByText(…)`)

## CI/CD

The auth setup works in CI as long as:
- `TEST_ADMIN_EMAIL` and `SUPABASE_SERVICE_ROLE_KEY` are set as secrets
- Supabase URL and keys are available during test run
