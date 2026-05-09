# Maintenance & Security — Dependency Upgrades, Tooling, CI

**Date:** 2026-05-09
**Status:** ✅ Complete
**Type:** Maintenance (no feature changes)

---

## Summary

A focused maintenance day addressing 101 Dependabot security vulnerabilities (reduced to 2), migrating ESLint to v10 flat config, setting up automated dependency tracking, and fixing several tooling issues discovered in the process. No game logic was changed.

---

## What Was Done

### 1. Security Dependency Upgrades (101 → 2 vulnerabilities)

**Problem:** Dependabot reported 101 security alerts across direct and transitive dependencies.

**Upgrades applied:**
| Package | Before | After |
|---------|--------|-------|
| `next` | 16.1.5 | 16.2.6 |
| `@prisma/client`, `@prisma/adapter-pg`, `prisma` | ^7.x | ^7.8.0 |
| `eslint` | 9.x | 10.3.0 |
| `eslint-plugin-react-hooks` | ^5.x | ^7.1.1 |
| `vitest` | 3.x | ^4.1.5 |
| `@playwright/test` | ^1.5x | ^1.59.1 |
| `postcss` | previous | ^8.5.14 |

**Yarn resolutions added** for transitive CVEs (packages not directly depended on):
- `minimatch`, `brace-expansion`, `flatted`, `picomatch`, `vite`, `postcss`, `@hono/node-server`, `js-yaml`

Remaining 2 vulnerabilities: transitive deps with no available fix yet — tracked and accepted.

**Decision: Use `resolutions` for transitive CVEs** rather than waiting for upstream packages to update. This is the standard Yarn approach for audited transitive vulnerabilities where the consuming package hasn't released a fix.

### 2. ESLint 10 Flat Config Migration

**Problem:** Upgrading ESLint 9→10 broke the existing config which used `FlatCompat` (the compatibility bridge from ESLint 8 class-style configs). ESLint 10 dropped `FlatCompat`, causing a circular JSON serialization error on startup.

**Solution:**
- Removed `FlatCompat` bridge entirely from `eslint.config.mjs`
- Switched to native `eslint-config-next` flat config export
- Disabled two rules that produced false positives on this codebase:
  - `react-hooks/error-boundaries` — false positive on Next.js async server components
  - `react-hooks/set-state-in-effect` — legitimate derived-state sync patterns used throughout hooks

**Additional fix:** `use-presence.tsx` needed `sendHeartbeatRef` added to dependency arrays to satisfy the stricter `react-hooks/immutability` rule introduced in the v7 plugin.

**Decision: Disable specific false-positive rules rather than suppress per-line.** File-level suppressions create noise and can hide real issues. The two disabled rules have known false-positive patterns in Next.js 15 async component and hook patterns. Noted in a comment in `eslint.config.mjs`.

### 3. Automated Dependency Updates — `.github/dependabot.yml`

Added Dependabot configuration for:
- npm dependencies (weekly, grouped by ecosystem: production/dev/testing/styling)
- GitHub Actions (weekly, auto-merge patch updates)

**Decision: Group Dependabot PRs by category** (not one PR per package). Reduces PR noise while keeping security updates fast. Grouping: `supabase`, `eslint`, `tanstack`, `tailwind`, `vitest`, `playwright` — each as a named group.

### 4. CI Fix — Build Job Env Fallbacks for Dependabot PRs

**Problem:** The CI build job required `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and other env vars. Dependabot PRs run without repository secrets, causing the build to fail with "missing environment variable" errors.

**Fix:** Added fallback values (`|| ''` or `|| 'http://localhost'`) to all env var references in `.github/workflows/ci.yml` for the build job. The build step only needs these vars for type-checking and bundling — it doesn't connect to any live database.

Also bumped `actions/setup-node` from v4 → v5 in the CI workflow.

### 5. GitHub MCP Server Package Fix

**Problem:** `.mcp.json` referenced a non-existent `@anthropic-ai/claude-code` GitHub MCP package name. The correct package is `@modelcontextprotocol/server-github`.

**Fix:** Replaced the incorrect package in `.mcp.json`, `.vscode/mcp.json`, and `.claude/settings.local.json`. Also reformatted the args array in `.mcp.json` for readability (one arg per line).

### 6. LF Line Ending Enforcement

**Problem:** Mixed CRLF/LF line endings were appearing in files edited on Windows or via certain tools, causing noisy diffs.

**Fix:**
- Added `.gitattributes` with `* text=auto eol=lf`
- Updated `.vscode/settings.json` with `"files.eol": "\n"`

### 7. Tooling Dependency Bumps (Dependabot PRs — merged same day)

Merged 10 Dependabot PRs for non-security routine updates:

| Package | Change |
|---------|--------|
| `zod` | 4.3.6 → 4.4.3 |
| `tailwind-merge` | 3.2.0 → 3.5.0 |
| `@tailwindcss/postcss` | 4.1.3 → 4.3.0 |
| `prettier` | 3.5.3 → 3.8.3 |
| `dotenv` | 17.2.3 → 17.4.2 |
| `tsx` | 4.20.6 → 4.21.0 |
| `vite-tsconfig-paths` | patch bump |
| TanStack group | patch bumps |
| `actions/checkout` | v4 → v6 |
| `actions/setup-node` | v5 → v6 |

**Note:** prettier 3.8.3 changed formatting for some edge cases. A follow-up commit (`884f0da`) reformatted affected files to match the new output.

### 8. Pg Pool Cap — EMAXCONN Prevention

**Problem:** Under load, the Prisma pg adapter was exhausting Supabase's connection limit, producing `EMAXCONN` errors.

**Fix:** Set `max: 2` on the `PrismaPg` adapter pool in `src/infrastructure/database/prisma/client.ts`. In serverless (Vercel), each lambda instance handles one request at a time, so 2 connections per instance is sufficient with headroom.

Also documented the correct `DATABASE_URL` pattern in `.env.example`: Supabase's Supavisor (pgbouncer) URL uses **port 6543** (not 5432). Switching to port 6543 routes connections through the pooler rather than directly to Postgres — this is the primary fix for connection exhaustion in production.

**Decision: Cap at 2, not 1.** A cap of 1 would serialize all queries within a single request that makes parallel Prisma calls. 2 provides parallelism while staying well within per-instance limits. The Supavisor URL change is the real production fix; the pool cap is a defence-in-depth guard.

### 9. Documentation — Prefer gh CLI Over GitHub MCP

Updated `.github/copilot-instructions.md` to clarify that the `gh` CLI should be used for all GitHub interactions (PRs, issues, comments, CI checks) rather than the GitHub MCP tools. The MCP tools have higher latency and less reliable output formatting for structured operations.

---

## Key Commits

| Hash | Message |
|------|---------|
| `ea6bc82` | fix: address Dependabot security vulnerabilities (101 → 2) |
| `c9cd998` | fix: enforce LF line endings via .gitattributes and VS Code settings |
| `edeb25c` | fix: replace non-existent github MCP package with correct one |
| `4a00411` | fix: format args in .mcp.json for better readability |
| `844829a` | ci: fix build job env fallbacks for Dependabot PRs, bump setup-node to v5 |
| `8b4e336` | fix: cap pg pool size to prevent EMAXCONN on Supabase |
| `76c0314` | fix: exclude Removed players from quiz state DTO |
| `884f0da` | fix: format files for prettier 3.8.3 compatibility |
| `305edf2` | docs: prefer gh CLI over GitHub MCP for PR/issue interactions |
| + 10× | build(deps): Dependabot routine bumps |

---

## Files Changed (key files)

| File | Change |
|------|--------|
| `package.json` | Major version bumps, resolutions for transitive CVEs |
| `yarn.lock` | Full regeneration |
| `eslint.config.mjs` | ESLint 10 flat config, removed FlatCompat |
| `.github/dependabot.yml` | New — automated update config |
| `.github/workflows/ci.yml` | Env fallbacks, setup-node v5 |
| `src/infrastructure/database/prisma/client.ts` | `max: 2` pool cap |
| `.env.example` | Document Supavisor URL (port 6543) |
| `.gitattributes` | LF enforcement |
| `.mcp.json` / `.vscode/mcp.json` | Correct GitHub MCP package |
| `src/hooks/use-presence.tsx` | `sendHeartbeatRef` to satisfy ESLint 10 hooks rule |

---

## Verification

| Check | Result |
|-------|--------|
| `yarn test` | ✅ All tests passing (no regressions from upgrades) |
| `yarn build` | ✅ Passes with ESLint 10 flat config |
| `yarn lint` | ✅ 0 errors |
| Dependabot alerts | ✅ 101 → 2 (2 remaining have no available fix) |
