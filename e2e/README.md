# E2E Testing Setup

This directory contains Playwright end-to-end tests for the Bobr Quiz application.

## Authentication Setup

Tests that require admin access (Quiz CRUD, Question CRUD) use a global authentication setup:

1. **`auth.setup.ts`** - Runs before all tests to create an authenticated session
2. **`playwright/.auth/user.json`** - Stores the session state (gitignored)
3. All test projects depend on the setup project and automatically use the saved auth state

## Environment Variables

Add these to your `.env.local` file:

```bash
# Test user credentials (must be in ADMIN_EMAILS allowlist)
TEST_ADMIN_EMAIL="your-test-user@example.com"
TEST_ADMIN_PASSWORD="your-test-password"

# Make sure test user is in admin allowlist
ADMIN_EMAILS="your-test-user@example.com,other-admin@example.com"
```

## Creating a Test User

1. Sign up for Supabase (if not already done)
2. Create a test user in your Supabase project:
   - Go to Authentication → Users
   - Click "Add user" → "Create new user"
   - Use email/password auth
   - Set email to match `TEST_ADMIN_EMAIL`
   - Set password to match `TEST_ADMIN_PASSWORD`
3. Add the email to `ADMIN_EMAILS` in `.env.local`

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
- **`host-dashboard.spec.ts`** - Host quiz control panel tests
- **`player-join.spec.ts`** - Player join flow tests
- **`admin-question-crud.spec.ts`** - Question CRUD tests (requires auth)

## Debugging Tips

1. **Auth failures**: Check that `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` are correct and the user exists in Supabase
2. **Timeout errors**: Increase timeout in `playwright.config.ts` or specific tests
3. **Flaky tests**: Use `page.waitForURL()`, `page.waitForSelector()`, or `expect().toBeVisible()` to wait for async operations
4. **View test traces**: After failure, open HTML report and click on failed test to see trace viewer

## CI/CD

The auth setup works in CI as long as:
- `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` are set as secrets
- Test user exists in Supabase
- Supabase URL and keys are available during test run
