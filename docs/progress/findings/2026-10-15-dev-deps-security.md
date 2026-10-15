# Dev dependency security pass — findings (2026-10-15)

**Ran:** after PR #65, on `chore/dev-deps-security` (from `84c4d08`), CachyOS, yarn 1.22.22.
Ledger: `.superpowers/sdd/2026-10-15-dev-deps-security/progress.md`.

## What drove it

Dependabot alerts left open after the Next.js upgrade (PR #65): 43 alerts, 0 critical, 16 high,
all in development tooling except `source-map-js` (build-time CSS) and `@hono/node-server`. Advisory
IDs per package are in the ledger, among them:
- `hono` (18 advisories) and `@hono/node-server` GHSA-frvp-7c67-39w9, `fast-uri` (7) and `mysql2`
  GHSA-3f6p-5ww8-9rcr: prisma's dev tooling.
- `vite` CVE-2026-53571 and CVE-2026-53632; `vitest` and `@vitest/mocker` CVE-2026-84373.
- `js-yaml` (5), `brace-expansion` CVE-2026-102277 and CVE-2026-13149, `browserslist`
  CVE-2026-73088, `@babel/core` CVE-2026-49356, `@humanfs/node` GHSA-p498-v437-472g: the ESLint chain.
- `source-map-js` CVE-2026-93749; `esbuild` GHSA-g7r4-m6w7-qqqr (via `tsx`).

`yarn audit` before: 89 findings (4 low, 35 moderate, 50 high). It counts per dependency path.

## What changed

- **All seven exact `resolutions` pins removed.**
  - Four held the tree on flagged versions: `vite` 6.4.2, `js-yaml` 4.1.0, `brace-expansion`
    1.1.14 and `@hono/node-server` 1.19.13.
  - An exact pin also applies to every consumer, across major versions. For example,
    `minimatch` 3.1.5 was forced on packages that ask for 9.x.
  - After the parents were upgraded, none had to come back.
- **Upgrades within the current major versions:**
  - `prisma`, `@prisma/client` and `@prisma/adapter-pg` 7.8.0 → 7.10.1
  - `vitest` 4.1.5 → 4.1.12
  - `tsx` 4.21.0 → 4.23.15 (`esbuild` 0.27 → 0.28.2)
  - the ESLint group within its ranges, which covers Dependabot PR #61
- **Stale yarn 1 lockfile entries re-resolved** by deleting them and running `yarn install`:
  - `fast-uri` 3.1.8
  - `source-map-js` 1.2.2
  - `vite` 8.3.4
  
  Yarn 1 keeps an existing entry that satisfies a range, so an old vulnerable copy survives an
  upgrade until its entry is deleted. That happened again here after PR #65.
- `vite` moved from 6 to 8. It is used only through vitest, whose 4.x range declares
  `^6 || ^7 || ^8`.

## Verification

| Check | Result |
|---|---|
| `yarn audit` | 1 finding: `braces` GHSA-vfj7-8cjw-p6xm, which has no fixed release. It is reachable only through ESLint (`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`) and Dependabot does not flag it. |
| `yarn prisma:generate` | Prisma Client 7.10.1, exit 0 |
| `tsc --noEmit -p .` | 0 errors |
| `yarn test:run` | Test Files 65 passed, 1 skipped (66); Tests 466 passed, 1 skipped (467); exit 0 |
| `yarn lint` | exit 0 (5 pre-existing warnings) |
| `yarn build` | exit 0 |
| Dev server | `/`, `/login` and `/icon-192.png` return 200 |
| `yarn test:e2e` | 18 passed, 16 failed, 4 did not run. The failing tests are the same 16 that fail on master ([Next.js upgrade findings](2026-10-15-next-security-upgrade.md)), with no new failure and none fixed. |

## Unresolved

- `braces`: wait for an upstream release.
- The 16 failing E2E tests on master, the intermittent unit test (this branch's verdict run passed; not
  investigated) and the E2E setup traps listed in the
  [Next.js upgrade findings](2026-10-15-next-security-upgrade.md). This record closes that
  record's "Dev-only alerts" item.
- The seed script (`yarn prisma:seed`, run with `tsx`) was not run, because it writes to the shared
  dev database. `tsx --version` runs.
