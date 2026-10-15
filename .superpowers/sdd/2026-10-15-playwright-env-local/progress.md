# Playwright env from .env.local — ledger

Branch `fix/playwright-env-local`, cut from master 039249c, in the main checkout (the dev server
ran there; the config is not part of the app). Bounded change, design approved in chat
(user: "approve, dev server started", 2026-10-15). Discharges the deferral "playwright.config
loads only .env", first recorded in
`docs/progress/findings/2026-10-15-next-security-upgrade.md` and carried in the E2E auth
account ledger.

## Cause
`playwright.config.ts` called `dotenv.config()`, which reads only `.env`. The repo has no `.env`
(only `.env.local` and `.env.example`), while `e2e/README.md` and `e2e/auth.setup.ts` say to put
the test accounts in `.env.local`. Every run printed "injected env (0) from .env" and needed the
four TEST_* variables exported by hand.

## Change (controller; b1493ea)
`dotenv.config({ path: ['.env.local', '.env'], quiet: true })`. dotenv 17.4.2 reads the array in
order and never overrides (`node_modules/dotenv/lib/main.js` populate), so `.env.local` beats
`.env` and the shell beats both. A missing file is returned as an error the config ignores
(main.js:272-313); `quiet` guards only the "injected env … tip" log (main.js:294, 309).

## Verification (nothing exported: `env -u` on the four TEST_* variables)
- Red before the change: setup failed "TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment
  variables are required"; 1 failed, 1 passed, 6 did not run.
- After: `e2e/admin-auth.spec.ts` 7 passed (invalid credentials failed once, passed on retry).
- Shell wins: TEST_AUTH_ADMIN_EMAIL exported as the shared email → the spec's guard threw.
- Full `yarn test:e2e`: 25 passed, 15 failed (all among master's 16; invalid credentials passed
  first time), 0 flaky, 0 did not run; 0 dotenv lines in the output. Master's 16 rebuilt from the
  list printed earlier in the session (the scratchpad copy was gone).
- eslint on the config exit 0, tsc exit 0.

## Review
- task-reviewer: APPROVED, 0 critical, 0 important, 3 minor, none needing a change (comment
  doesn't say a missing file is silent — setup's own message covers it; README already says
  .env.local; the runner now holds all of .env.local, harmless for the dev server). Tamper check
  clean. Its dotenv claims re-checked by the controller (main.js lines above).

## Deferred
- `prisma.config.ts` and `vitest.config.ts` also load only `.env`. Premise: loading `.env.local`
  there changes which database the Prisma CLI and the unit tests see; needs its own check.
