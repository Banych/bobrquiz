# E2E logout test revokes the shared admin session — findings (2026-10-15)

**Ran:** `yarn test:e2e` on `fix/supabase-anon-clients` (95abf0f), dev server from that worktree,
CachyOS, Playwright 1.64.1, local default workers. Ledger:
`.superpowers/sdd/2026-10-15-supabase-anon-clients/progress.md`.

## Symptom

Full run: 16 passed, 21 failed, 3 did not run. Against master's 16 known failures, 7 new ones:
five admin question CRUD tests, admin quiz CRUD "should create a new quiz" and the admin case of
`e2e/supabase-clients.spec.ts`. They failed on `page.waitForURL('**/admin/quizzes')` or
`toHaveURL(/\/admin\/quizzes/)` landing on `/login?redirect=%2Fadmin%2Fquizzes`, or on a dialog
whose request never succeeded.

## Cause (confirmed)

- The admin layout's Logout calls `supabase.auth.signOut()` (`src/app/(admin)/admin/layout.tsx:30`).
  auth-js defaults it to `{ scope: 'global' }` (`GoTrueClient.js:3176`), which revokes **every**
  session of that user, not only the browser's own.
- `e2e/admin-auth.spec.ts` "should logout and redirect to login page" logs in as the same admin
  that `e2e/auth.setup.ts` saves to `playwright/.auth/user.json`, which every other admin test
  loads. Once it clicks Logout, the saved session is dead, and `getUser()` in the proxy returns no
  user for every test still using it.
- Master hid it: the spec runs in serial mode, and its "should show error for invalid credentials"
  test failed on master in both the attempt and the retry, so the four tests after it, logout
  included, never ran. On this run that test passed, logout ran, and the admin tests running in
  parallel lost their session.

## Evidence

- Dev log, proxy lines per 10 s: 01:20–01:29 25 authorized, 1 none (the expected
  unauthenticated test); 01:30–01:39 19 authorized, 20 none, the first none at 01:31.155 across
  several tests and routes at once; 01:40–01:49 0 authorized, 5 none. The proxy logged no
  "Auth error": `getUser()` returned no user rather than throwing.
- Admin specs without `admin-auth.spec.ts` (`--retries=0`): 15 passed, 1 failed (active-quiz
  buttons, one of master's 16).
- Direct sequence, each step reusing the saved session (`--no-deps` after the first):
  1. setup + admin case of `supabase-clients.spec.ts`: passed.
  2. same admin case again: passed.
  3. the logout test alone: passed.
  4. same admin case again: failed, received `http://localhost:3000/login?redirect=%2Fadmin%2Fquizzes`.

## Consequences for later runs

- Any full E2E run where "invalid credentials" passes will show admin failures that are not
  regressions. Compare against master only after checking whether the logout test ran.
- Not fixed here: changing the logout to `scope: 'local'` changes what users get (other devices
  stay signed in); the other routes are a separate admin account for the auth spec, or running it
  in its own project after the others. Open, needs a ruling.
- The same runs also showed a slow sign-in (form still on "Signing in..." after 5 s) and a
  question list stuck on "Loading questions..." for 15 s, once each, with a valid session. Cause
  unknown; recorded only.
