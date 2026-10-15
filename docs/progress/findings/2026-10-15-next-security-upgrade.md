# Next.js security upgrade — findings (2026-10-15)

**Ran:** Dependabot triage and the `next` 16.2.6 → 16.3.8 upgrade on `fix/next-security`, CachyOS,
yarn 1.22.22, git 2.55.0. Ledger: `.superpowers/sdd/2026-10-15-next-security/progress.md`.

## What drove it

71 open Dependabot alerts on master (`gh api repos/Banych/bobrquiz/dependabot/alerts?state=open`):
18 packages. Each advisory is counted twice, once for `package.json` and once for `yarn.lock`.

The `next` advisories, and whether this app was exposed (all fixed by 16.3.6 or later):

| Advisory | Severity | Exposed |
|---|---|---|
| GHSA-vcvr-r3jv-pc5j, RCE in `next/og` `ImageResponse` | critical | **Yes, at request time.** `/icon-192.png` and `/icon-512.png` are dynamic route handlers that render `ImageResponse`. `/opengraph-image`, `/icon` and `/apple-icon` are prerendered. |
| GHSA-2xp9-vwfh-vxw4, unauthenticated RCE in Image Optimization with AVIF | critical | Possibly. `next/image` loads from Supabase storage. Whether Vercel's optimizer runs Next's code is not verified. |
| CVE-2026-75604, RCE on Windows-hosted servers | critical | No (Vercel, Linux). |
| CVE-2026-64642, middleware bypass with Turbopack | high | Likely. `src/middleware.ts` guards `/admin`. |
| CVE-2026-64645, CVE-2026-64649, CVE-2026-64641 (SSRF in rewrites; SSRF and DoS in Server Actions) | high | No. The app has no rewrites, no `'use server'` and no custom server. |
| CVE-2026-64646, -64648, -64643, -64647, -64644 | medium | Fixed by the same upgrade. |

The same upgrade fixes these:
- `sharp` 0.34.5 → 0.35.5, via next: GHSA-rgj7-g3m4-5g8c and GHSA-f88m-g3jw-g9cj.
- `postcss` → 8.5.23 (next) and 8.5.30 (everywhere else): CVE-2026-73646 and CVE-2026-69153.
- `nanoid` → 3.3.20: CVE-2026-67213 and CVE-2026-67214.
- `baseline-browser-mapping` → 2.11.29: CVE-2026-45819.

## What broke and how it was fixed

- **A `resolutions` pin kept a vulnerable copy.**
  - `package.json` pinned `postcss: 8.5.14`. It was added in `ea6bc82` (2026-05-09) under "Add
    yarn resolutions for transitive CVEs". The commit doesn't record why it was exact.
  - Yarn 1 then merged next 16.3.8's exact `postcss@8.5.23` into the 8.5.14 entry, so
    `node_modules/next/node_modules/postcss` stayed at 8.5.14.
  - Fix: the pin is removed. Next 16.3.8 pins a patched version itself.
- **Lint packages moved with it.** `eslint-config-next` resolved to 16.4.1 within `^16.3.8`, which
  brings `@next/eslint-plugin-next` 16.4.1 and `typescript-eslint` 8.59.2 → 8.71.2. All are
  minor bumps, and lint passes.
- **Stale lockfile entries.** Yarn 1 reuses an existing entry that satisfies a range. The old
  `postcss`, `nanoid` and `baseline-browser-mapping` entries were deleted from `yarn.lock` and
  re-resolved with `yarn install`.
- **The build failed type-checking 13 errors in four test files.**
  - Master's own `tsc --noEmit -p .` shows the same 13 errors. Master's `yarn build` (16.2.6)
    passes, because Next 16.3 type-checks files that 16.2.6 did not reach.
  - Vitest does not type-check, so the errors never surfaced.
  - Fix: the test types were corrected (`fda0c08`). No build-scope exclude was added.

## Verification

| Check | Result |
|---|---|
| `yarn test:run` | Test Files 65 passed, 1 skipped (66); Tests 466 passed, 1 skipped (467); exit 0, same as before the change |
| `tsc --noEmit -p .` | 0 errors (master: 13) |
| `yarn lint` | exit 0 (5 pre-existing warnings) |
| `yarn build` | exit 0 |
| Dev server, curl | `/`, `/icon`, `/apple-icon`, `/icon-192.png`, `/icon-512.png` and `/opengraph-image` return 200 (PNG for the image routes); `/admin` returns 307 to `/login?redirect=%2Fadmin` when logged out |
| `yarn test:e2e` | 18 passed, 16 failed, 4 did not run. Master on the same machine (worktree at `e204534`, Next 16.2.6): **the same 16 tests fail**, with the same counts. |

The 16 E2E tests that fail on master too:
- `admin-auth` (invalid credentials)
- `admin-quiz-crud` (active quiz buttons)
- `host-dashboard` ×2
- `player-connection-status` ×3
- `player-reconnection` ×5
- `round-transitions` ×4

## Learned about the E2E setup (pre-existing, not fixed here)

- CI does not run E2E (`.github/workflows/` has no Playwright step), so nothing showed that the
  suite was red on master.
- `playwright.config.ts` loads `.env` only (`dotenv.config()`). The `TEST_ADMIN_EMAIL` and
  `TEST_ADMIN_PASSWORD` credentials live in `.env.local`, so auth setup fails unless they are
  exported into the environment.
  (Fixed 2026-10-15, `fix/playwright-env-local`: the config now loads `.env.local`, then `.env`.)
- A Playwright update needs `yarn playwright install chromium` (it downloads into
  `~/.cache/ms-playwright` with no sudo). Without it, every test fails at browser launch.
- A fresh worktree needs `yarn prisma:generate` before `yarn dev`. Otherwise every API route
  fails with "Can't resolve './generated/client/client'", and Turbopack keeps that error until
  the server is restarted.

## Unresolved

- Dev-only alerts (prisma's dev tooling, the vitest and eslint chains) and the remaining
  `resolutions` pins (`vite` 6.4.2, `js-yaml` 4.1.0, `brace-expansion` 1.1.14, `@hono/node-server`
  1.19.13 and others). Several of the pinned versions are now flagged themselves. These go to the
  dev-dependency branch.
- The 16 failing E2E tests on master, and an intermittent unit test (1 failure in 15 runs on
  2026-10-15, not identified).
