# E2E auth spec account — ledger

Branch `test/e2e-auth-account`, cut from master e006164, rebased onto 8aae400 (after the
Supabase anonymous clients PR), in `.claude/worktrees/test-e2e-auth-account`.
Bounded change, design approved in chat (user chose "option 2" of three on 2026-10-15; then
created the account and set `.env.local`: "created user", "done, dev server restarted").

## Premise
`docs/progress/findings/2026-10-15-e2e-logout-revokes-admin-session.md`: the auth spec's logout
test signs out globally and revoked the session `auth.setup.ts` saves for every other admin test.
Options were: logout `scope: 'local'` (changes what users get), a separate account (chosen), or
running the auth spec last in its own project (still logs the real account out every run).

## Change (controller; 5c7a38d, fix round 9a9fc80)
- `e2e/admin-auth.spec.ts`: `TEST_AUTH_ADMIN_EMAIL` / `TEST_AUTH_ADMIN_PASSWORD` for all four
  login tests; no fallback (unset → skip, message names the new vars); module-level guard throws
  when the auth email equals `TEST_ADMIN_EMAIL` (case-insensitive). `auth.setup.ts` unchanged.
- `.env.example`, `e2e/README.md`: the two vars, the `ADMIN_EMAILS` requirement, why the spec has
  its own account; fix round added the spec to Test Structure and to the auth debugging tip.
- The user's own setup (not in the repo): Supabase dev-project user created with auto confirm,
  `.env.local` given both vars and the email appended to `ADMIN_EMAILS` (checked by key names
  and a node comparison, values never printed).

## Verification
- tsc exit 0 (after `yarn prisma:generate` in the fresh worktree), eslint on the spec exit 0,
  prettier check clean.
- Guard negative: auth email set to the shared one → Playwright error with the guard's message,
  "No tests found", exit 1. Guard not loaded by other runs: same env, `playwright test
  e2e/player-join.spec.ts --list` on 1.64.1 → "Total: 5 tests in 3 files", no error.
- Sequence (saved session reused with `--no-deps`): setup + admin check passed; logout test
  passed; admin check on the same session passed (failed with a /login redirect before).
- Full `yarn test:e2e`: 24 passed, 15 failed (all among master's 16), 1 flaky (invalid
  credentials), 0 did not run; logout ran and passed. Dev log: 0 "Multiple GoTrueClient" lines.

## Review
- task-reviewer: APPROVED, 0 critical, 0 important, 5 minor. Fixed in 9a9fc80: the debugging
  tip named only `TEST_ADMIN_*`; Test Structure omitted the auth spec. Kept: the README's auto
  confirm / restart steps (accurate, beyond the design), the CI secrets list (CI runs no E2E),
  the comment and guard (no change asked). Scoped re-review of 9a9fc80: APPROVED, tamper
  check clean. The first review's file-loading claim was read from 1.59.1
  in the yarn cache; re-checked on 1.64.1 above. Tamper check clean.
- Not changed, already deferred: `playwright.config.ts` loads only `.env`, so the vars in
  `.env.local` must be exported before `yarn test:e2e` (the README says `.env.local`).
