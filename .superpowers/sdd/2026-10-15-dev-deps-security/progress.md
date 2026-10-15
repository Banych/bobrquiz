# Ledger — chore/dev-deps-security (bounded; design given in chat after PR #65, user said "go" 2026-10-15)

Design: re-resolve source-map-js and other stale `^` entries; prisma → 7.10, vitest → 4.1.12, eslint chain; re-evaluate the exact `resolutions` pins (drop where the parent brings a fixed version, raise the rest); verify build, unit, lint, E2E against master.
Branch cut from origin/master at 84c4d08 (PR #65 merged).

## Before (2026-10-15)
Dependabot open alerts (yarn.lock manifest), advisory IDs per package:
@babel/core: CVE-2026-49356
@hono/node-server: GHSA-frvp-7c67-39w9
@humanfs/node: GHSA-p498-v437-472g
@vitest/mocker: CVE-2026-84373
brace-expansion: CVE-2026-102277, CVE-2026-13149
browserslist: CVE-2026-73088
esbuild: GHSA-g7r4-m6w7-qqqr
fast-uri: CVE-2026-13676, CVE-2026-16221, CVE-2026-18446, CVE-2026-75899, CVE-2026-75975, CVE-2026-76172, CVE-2026-84292
hono: CVE-2026-47673, CVE-2026-47674, CVE-2026-47675, CVE-2026-47676, CVE-2026-54286, CVE-2026-54287, CVE-2026-54288, CVE-2026-54289, CVE-2026-54290, CVE-2026-59895, CVE-2026-59896, CVE-2026-59897, CVE-2026-71848, CVE-2026-71849, CVE-2026-71850, CVE-2026-84363, CVE-2026-84365, CVE-2026-93981
js-yaml: CVE-2025-64718, CVE-2026-53550, CVE-2026-59869, CVE-2026-84375, GHSA-5p4m-2wfm-xmqj
mysql2: GHSA-3f6p-5ww8-9rcr
source-map-js: CVE-2026-93749
vite: CVE-2026-53571, CVE-2026-53632
vitest: CVE-2026-84373
yarn audit (local, counts per path) before: 89 vulnerabilities (4 low, 35 moderate, 50 high); per package: @babel/core, @hono/node-server, @humanfs/node, @vitest/mocker, brace-expansion, braces (no patch), browserslist, colord, deepmerge-ts, esbuild, fast-uri, hono, js-yaml, mysql2, source-map-js, valibot, vite, vitest.

## Execution
Removed all `resolutions` (minimatch 3.1.5, brace-expansion 1.1.14, flatted 3.4.2, picomatch 4.0.4, vite 6.4.2, @hono/node-server 1.19.13, js-yaml 4.1.0).
Ruling: drop every exact pin rather than raise them — an exact pin applies to every consumer across majors (e.g. minimatch 3.1.5 for packages asking for 9.x) and freezes the tree on the pinned version; re-add only what audit still needs, as a range — cost if wrong: an old vulnerable copy comes back, which the post-change audit would show (it does not)
yarn add @prisma/client@^7.10.1 @prisma/adapter-pg@^7.10.1; -D prisma@^7.10.1 vitest@^4.1.12; yarn upgrade of the eslint group within range (what Dependabot PR #61 proposes).
Audit after: braces, esbuild 0.27.7, fast-uri 3.1.2, source-map-js 1.2.1, vite 6.4.2 — the last three stale lock entries.
Deleted the stale entries (fast-uri 3.1.2, source-map-js 1.2.1, vite 6.4.2, esbuild 0.27.7) and ran yarn install: fast-uri 3.1.8, source-map-js 1.2.2, vite 8.3.4, esbuild still ~0.27 via tsx.
Ruling: accept vite 8.3.4 (from 6.4.2) — vite is only used through vitest, whose 4.x range declares ^6 || ^7 || ^8; unit tests pass on it — cost if wrong: a vitest-only break, visible in yarn test:run
-D tsx@^4.23.15 (esbuild ~0.28 → 0.28.2; GHSA-g7r4-m6w7-qqqr is Windows dev-server only, fixed anyway).
Audit final: only braces (GHSA-vfj7-8cjw-p6xm, <=3.0.3, no patched release; via eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch; not flagged by Dependabot).
Ruling: leave braces — no fixed release exists, dev-only lint path — cost if wrong: none until a fix ships
Verification on the working tree before commit: yarn prisma:generate (Prisma Client 7.10.1) exit 0; tsc --noEmit 0 errors; yarn test:run Test Files 65 passed | 1 skipped (66), Tests 466 passed | 1 skipped (467), exit 0; yarn lint exit 0 (0 errors, 5 pre-existing warnings); yarn build exit 0; tsx --version 4.23.15.
74b1b70 fix(deps): clear dev dependency advisories
Pending: E2E (user to restart yarn dev on this branch; Prisma client changed), review, findings record, PR draft.
E2E on 74b1b70 (user restarted yarn dev in the main checkout): curl / /login /icon-192.png → 200; yarn test:e2e 18 passed, 16 failed, 4 did not run; failing list identical to the master baseline from the Next.js branch (comm: 0 new, 0 fixed, 16 both).
Findings record: docs/progress/findings/2026-10-15-dev-deps-security.md
Review (task-reviewer, sonnet) on 1e32be5: APPROVED, 0 critical, 0 important. Tamper check: HEAD 1e32be5 and clean status before and after; ledger dir listing unchanged.
Minor 1 fixed: alert totals evidenced by gh api repos/Banych/bobrquiz/dependabot/alerts?state=open (2026-10-15, master): 43 total, all yarn.lock; high 16, medium 24, low 3.
Unevidenced PR #61 claim checked: gh pr view 61 targets @eslint/eslintrc 3.3.6, eslint 10.8.0, eslint-config-next 16.2.12, eslint-plugin-prettier 5.5.6, eslint-plugin-react-refresh 0.5.3; lock at HEAD has 3.3.7, 10.12.0, 16.4.1, 5.5.7, 0.5.7. Record now says it supersedes #61.
Minor 3 fixed: flaky-test line carries the 1-in-15 count. Minors 4 and 5 need no change (intermediate ledger state; yarn 1 dev flag).
PR #66 opened with the approved text (user: "approve"); work index line added to docs/progress/PROGRESS.md. Merge waits for the user.
