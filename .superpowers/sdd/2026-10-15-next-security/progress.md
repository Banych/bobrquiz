# Ledger — fix/next-security (bounded, in-chat design approved by the user 2026-10-15)

Design: next + eslint-config-next 16.2.6 → 16.3.8, postcss ≥ 8.5.23; verify build, unit, lint, E2E,
browser check of the OG image route and the admin middleware; advisory IDs in a findings record.
Branch cut from origin/master at e204534.

## Triage (2026-10-15, read-only, `gh api repos/Banych/bobrquiz/dependabot/alerts?state=open`)
71 open alerts = 18 packages, each advisory counted twice (package.json + yarn.lock manifests).
Exposure of the next advisories (fix ≥ 16.3.6):
- GHSA-vcvr-r3jv-pc5j critical, RCE in next/og ImageResponse — EXPOSED (src/app/opengraph-image.tsx, src/components/brand/mascot-image-response.tsx)
- GHSA-2xp9-vwfh-vxw4 critical, RCE in Image Optimization with AVIF — POSSIBLY (next/image from Supabase storage; whether Vercel's optimizer runs Next's code is unverified)
- CVE-2026-75604 critical, RCE on Windows-hosted servers — no (Vercel, Linux)
- CVE-2026-64642 high, middleware bypass with Turbopack — LIKELY (src/middleware.ts guards admin; Next 16 builds with Turbopack)
- CVE-2026-64645 / -64649 / -64641 high (SSRF in rewrites, SSRF in Server Actions on custom servers, Server Action DoS) — no (no rewrites, no 'use server', no custom server)
- CVE-2026-64646 / -64648 / -64643 / -64647 / -64644 medium — fixed by the same upgrade
Also in this branch: sharp (GHSA-rgj7-g3m4-5g8c, GHSA-f88m-g3jw-g9cj; via next), postcss (CVE-2026-73646, CVE-2026-69153), nanoid (CVE-2026-67213, CVE-2026-67214; via postcss), baseline-browser-mapping (CVE-2026-45819; via next).
Left for branch 2 (dev-only): hono, fast-uri, mysql2, @hono/node-server (prisma dev tooling); vite, @vitest/mocker, vitest; js-yaml, brace-expansion, browserslist, @babel/core, @humanfs/node, esbuild (eslint chain).

## Execution
Baseline on the branch before changes: yarn test:run Test Files 65 passed | 1 skipped (66), Tests 466 passed | 1 skipped (467), exit 0.
yarn add --exact next@16.3.8; postcss@^8.5.30; -D eslint-config-next@^16.3.8 (resolved 16.4.1). sharp → 0.35.5.
Finding: yarn 1 left next's exact `postcss@8.5.23` merged into an entry resolving 8.5.14 — next/node_modules/postcss was 8.5.14 (still vulnerable). Cause: package.json `resolutions` pinned `postcss: 8.5.14` (added in ea6bc82, 2026-05-09, to lift Next's bundled postcss to a patched version).
Ruling: removed the postcss resolution — next now pins 8.5.23 (patched for both postcss advisories), and an exact pin freezes the tree on a version later advisories cover — cost if wrong: none (all copies now 8.5.23 or 8.5.30)
Ruling: other resolutions (minimatch, brace-expansion, flatted, picomatch, vite 6.4.2, @hono/node-server 1.19.13, js-yaml 4.1.0) stay for branch 2 — several are themselves now flagged; they need re-evaluation with the dev-deps upgrade — cost if wrong: dev-only alerts stay open a little longer
Re-resolved stale lock entries (postcss ^8.5.10/^8.5.3 group, nanoid ^3.3.11, baseline-browser-mapping) by deleting them and running yarn install: postcss 8.5.23 (next) / 8.5.30 (rest), nanoid 3.3.20, baseline-browser-mapping 2.11.29.
Finding: yarn build failed type-checking 13 errors in 4 test files. Master's own `tsc --noEmit -p .` shows the same 13; master's yarn build (16.2.6, temp worktree) passed — Next 16.3 type-checks files 16.2.6 did not reach. Vitest does not type-check, so they never surfaced.
Ruling: fix the 13 test type errors (tests only) rather than excluding src/tests from type checking — hiding them keeps wrong test types; a build-scope exclude is a shim — cost if wrong: four test files touched in a security branch
Dispatched implementer (sonnet pin) with test-types-brief.md; test fixes commit before the upgrade commit so every commit builds.
fda0c08 test: fix type errors that next 16.3 build now checks (implementer DONE; controller re-ran: 4 test files only, no trailers, tsc 0 errors, yarn test:run Test Files 65 passed | 1 skipped (66) / Tests 466 passed | 1 skipped (467) exit 0, yarn build exit 0). Missing ctor args were RemovePlayerUseCase (PlayerService) and ResetQuizUseCase (QuizService); scoringAlgorithm 'EXPONENTIAL_DECAY' = zod default in quiz-admin.dto.ts; no assertion touches the added values.
82498f6 fix(deps): upgrade next to 16.3.8 for security advisories (package.json + yarn.lock)
Exposure confirmed: GHSA-vcvr-r3jv-pc5j reachable at request time — /icon-192.png and /icon-512.png are dynamic (ƒ) route handlers using ImageResponse; /opengraph-image, /icon, /apple-icon are prerendered (○).
Pending: E2E + browser check (dev server, user to start), findings record, review, PR draft.
Verification on 82498f6 (dev server = this branch, started by the user): curl / /icon /apple-icon /icon-192.png /icon-512.png /opengraph-image → 200 (PNG); /admin → 307 to /login?redirect=%2Fadmin.
E2E: first run failed at browser launch (chromium-headless-shell 1217 missing) → `yarn playwright install chromium` (no sudo; ~/.cache/ms-playwright). Second run: auth setup threw "TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD … required" — playwright.config.ts loads .env only, credentials are in .env.local → exported the two vars from .env.local for the run (values not printed).
E2E branch: 18 passed, 16 failed, 4 did not run (exit 1).
E2E master baseline: worktree /home/banykinv/Documents/repos/bobrquiz-master-baseline at e204534 (next 16.2.6), user ran yarn dev there; first attempt 500s — no generated Prisma client in a fresh worktree; `yarn prisma:generate` + user restart (Turbopack kept the module-not-found). Master: 18 passed, 16 failed, 4 did not run; the failing-test lists are identical (comm: 0 branch-only, 0 master-only, 16 both).
Ruling: the 16 E2E failures are pre-existing and do not block this branch — identical on master at e204534 — cost if wrong: none for this change; the suite needs its own fix
Findings record: docs/progress/findings/2026-10-15-next-security-upgrade.md (advisories, exposure, what broke, verification, E2E setup traps, unresolved)
Review (task-reviewer, e204534..1b1d7b7): APPROVED, two Minor doc nits (ea6bc82 purpose stated as fact; eslint chain bumps unmentioned) — fixed in the findings record; tamper check clean (HEAD 1b1d7b7, status empty, ledger listing unchanged). Reviewer re-ran tsc 0 and yarn test:run 65|1 files, 466|1 tests, exit 0; lockfile parse found no dangling specs.
