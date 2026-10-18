# E2E Testing Setup

This directory contains Playwright end-to-end tests for the Bobr Quiz application.

## Authentication Setup

Tests that require admin access (Quiz CRUD, Question CRUD) use a global authentication setup:

1. **`auth.setup.ts`** - Runs before all tests to create an authenticated session
2. **`playwright/.auth/user.json`** - Stores the session state (gitignored)
3. Projects run in the order `setup` → `cleanup` → `chromium`; `chromium` uses the saved auth state

## Environment Variables

Add these to your `.env.local` file:

```bash
# Test user credentials (must be in ADMIN_EMAILS allowlist)
TEST_ADMIN_EMAIL="your-test-user@example.com"
TEST_ADMIN_PASSWORD="your-test-password"

# Second admin, used only by admin-auth.spec.ts (must also be in ADMIN_EMAILS)
TEST_AUTH_ADMIN_EMAIL="your-auth-test-user@example.com"
TEST_AUTH_ADMIN_PASSWORD="your-auth-test-password"

# Make sure both test users are in admin allowlist
ADMIN_EMAILS="your-test-user@example.com,your-auth-test-user@example.com"
```

`admin-auth.spec.ts` has its own account because its logout test signs out every session of
the user it logs in as (Supabase's `signOut()` defaults to the global scope). With the shared
account it would revoke the session the other admin tests use, and they would land on `/login`.
The spec refuses to run if the two emails are the same; without the auth-spec variables its
login tests are skipped.

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

1. Sign up for Supabase (if not already done)
2. Create a test user in your Supabase project:
   - Go to Authentication → Users
   - Click "Add user" → "Create new user"
   - Use email/password auth
   - Set email to match `TEST_ADMIN_EMAIL`
   - Set password to match `TEST_ADMIN_PASSWORD`
   - Turn on "Auto Confirm User"
3. Repeat for the auth-spec user (`TEST_AUTH_ADMIN_EMAIL`, `TEST_AUTH_ADMIN_PASSWORD`)
4. Add both emails to `ADMIN_EMAILS` in `.env.local` and restart the dev server

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
- **`admin-auth.spec.ts`** - Login, logout and redirect tests (own account, `TEST_AUTH_ADMIN_*`)
- **`support/quiz-fixtures.ts`** - `createQuiz` fixture: each test that needs a quiz gets its own, created through the admin API and deleted after the test (titles start with `E2E fixture `)
- **`stale-quizzes.cleanup.ts`** - `cleanup` project: deletes fixture quizzes older than 30 minutes, left by crashed runs
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

1. **Auth failures**: Check that `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` are correct and the user exists in Supabase
   (for `admin-auth.spec.ts`: `TEST_AUTH_ADMIN_EMAIL` and `TEST_AUTH_ADMIN_PASSWORD`; its login tests skip when they are unset)
2. **Timeout errors**: Increase timeout in `playwright.config.ts` or specific tests
3. **Flaky tests**: Use `page.waitForURL()`, `page.waitForSelector()`, or `expect().toBeVisible()` to wait for async operations. A test that passes only on its retry still fails the run (`failOnFlakyTests`): find its cause rather than rerunning
4. **View test traces**: After failure, open HTML report and click on failed test to see trace viewer

## CI/CD

The auth setup works in CI as long as:
- `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` are set as secrets
- Test user exists in Supabase
- Supabase URL and keys are available during test run
