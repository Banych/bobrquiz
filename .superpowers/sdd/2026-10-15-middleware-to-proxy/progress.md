# Middleware → proxy (Next 16) — ledger

Branch `chore/middleware-to-proxy`, cut from master 93dd6d4, in `.claude/worktrees/chore-middleware-to-proxy`.
Bounded; design approved in chat (user: "approve", 2026-10-15). Source: the dev log warning
`⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` (lucide-react ledger).

## Change (implementer, sonnet)
- aa35066: `npx @next/codemod@16.3.8 middleware-to-proxy .` renamed `src/middleware.ts` →
  `src/proxy.ts` and `middleware` → `proxy` (codemod summary said "0 ok, 1 skipped", yet the
  rename happened; it needed `--force` because the new test file made the tree dirty). Only other
  change: the header comment. Matcher and logic unchanged (controller diffed with -M).
- New `src/tests/proxy.test.ts`, 9 tests: non-admin path passes without creating a client; page
  with no user → 307 to `/login?redirect=…`; API with no user → 401; non-allowlisted → 403 (page
  and API); allowlisted passes; `getUser` throwing → login redirect / 401; matcher unchanged.
  Written first and failed on the missing module; after the rename, a deliberate 403→401 mutation
  failed 1 test, reverted to 9/9.
- dfa8f13: live doc references updated (CLAUDE.md debugging order, PATTERNS.md, SETUP.md).
- Ruling (revisitable): general prose that says "middleware" without the path stays —
  docs/INDEX.md:146, ARCHITECTURE.md:433, MEDIA-UPLOADS.md:45,53,61, comments in
  login/page.tsx:49 and supabase-auth-client.ts:27,56 — and the `[MIDDLEWARE]` log prefixes. Cost:
  a reader meets both words; Next's own docs still describe proxy as the renamed middleware.

## Verification
- Implementer: yarn test:run Test Files 66 passed | 1 skipped (67), Tests 475 passed | 1 skipped
  (476), exit 0; yarn lint exit 0, 5 warnings; tsc exit 0; yarn build exit 0 with placeholder env,
  build output lists `ƒ Proxy (Middleware)` and no deprecation line.
- Controller: `yarn test:run src/tests/proxy.test.ts` Test Files 1 passed (1), Tests 9 passed (9).
- Dev server and E2E: pending.

## Review
- task-reviewer on 61da978: APPROVED, 0 critical, 0 important. Tamper check: HEAD and status of the worktree and the main checkout unchanged.
- Runtime (reviewer, node_modules/next 16.3.8): build/entries.js:231-233 runs a proxy file on the server (Node) only; the old middleware had no runtime export, so it ran on edge. dist/docs/.../proxy.md:255: "Proxy defaults to using the Node.js runtime. The runtime config option is not available". The proxy imports only next/server, @supabase/ssr and isAdminUser (reads process.env.ADMIN_EMAILS), so the edge → Node switch changes no behaviour here.
- Minor 1 fixed in this round: new test "reads request cookies and forwards refreshed session cookies" (commit after 61da978). 10/10 pass; mutating src/proxy.ts to drop `supabaseResponse.cookies.set` fails exactly that test (1 failed | 9 passed), restored.
- Minors 2-3 (no change): [MIDDLEWARE] log prefixes and prose/historical "middleware" mentions, as ruled above.

## End-to-end (controller, dev server started by the user in this worktree)
- Warm-up with curl: / 200, /login 200, /admin 307 → /login?redirect=%2Fadmin, /admin/quizzes 307 → /login?redirect=%2Fadmin%2Fquizzes, /api/admin/quizzes 401, /icon-192.png 200. The proxy guards on the Node runtime as the middleware did on edge.
- yarn test:e2e: 18 passed, 16 failed, 4 did not run (1.4m). Failing list vs master baseline: 0 new, 0 fixed, 16 in both. admin-auth and admin CRUD specs pass as on master.
- Dev log: 0 lines matching the middleware deprecation warning before and after the run.

PR #71 opened with the approved text (user: "approve"); work index line added. Merge waits for the user.
