# TypeScript 6 — ledger

Branch `chore/typescript-6`, cut from `origin/master` at 2b65ebe, in the worktree
`.claude/worktrees/agent-a4fd9618e9403bdc9` (run in parallel with `chore/lucide-react-1`).
Replaces Dependabot PR #44. Bounded work; design approved in chat (user: "approve", 2026-10-15)
after a throwaway probe in the same worktree.

## Rulings
- `typescript` `^5` → `~6.0.3`, not `^6`: typescript-eslint 8.71.2 (all four packages) peers
  `typescript >=4.8.4 <6.1.0`. A tilde keeps a fresh resolve from pulling 6.1 before
  typescript-eslint supports it. Cost: 6.1 needs a manual bump together with typescript-eslint.
  Revisitable.
- No tsconfig change: TS 6.0.3 reports no deprecated or removed option in `tsconfig.json`
  (target ES2017, moduleResolution bundler, paths without baseUrl, strict, isolatedModules).
- No E2E run: Next compiles with SWC and `tsc` only type-checks (`noEmit`), so the runtime
  output does not depend on the TypeScript version. CI runs lint, unit tests and build.

## Compatibility (probe, node_modules peerDependencies)
- next 16.3.8, vitest 4.1.12: no typescript peer. eslint-config-next 16.4.1: `>=3.3.1`.
  prisma 7.10.1: `>=5.4.0` (optional). vite-tsconfig-paths 6.1.1: vite only.

## Verification (2026-10-15, CachyOS, Node v24.18.1, in the worktree)
- `npx tsc -v`: Version 6.0.3. yarn.lock: `typescript@~6.0.3` → 6.0.3, single entry.
- npx tsc --noEmit -p .: exit 0, 0 errors.
- yarn test:run: Test Files 65 passed | 1 skipped (66); Tests 466 passed | 1 skipped (467); exit 0.
- yarn lint: exit 0, 5 problems (0 errors, 5 warnings), the same five files as master's list
  (admin layout `<a>`, question-view `<img>`, three tests/load/*.js default exports).
- yarn build: exit 0 with placeholder DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. The worktree has no .env.local, and
  `src/lib/env-validation.ts` throws during page-data collection without them; compile and
  TypeScript steps pass before that point.
