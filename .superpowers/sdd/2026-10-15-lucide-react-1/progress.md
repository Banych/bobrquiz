# lucide-react 1.x — ledger

Branch `chore/lucide-react-1`, cut from `origin/master` at 2b65ebe, in the main checkout (run in
parallel with `chore/typescript-6` in a worktree). Replaces Dependabot PR #46. Bounded work;
design approved in chat (user: "approve", 2026-10-15) after a throwaway probe in a worktree.

## Rulings
- `lucide-react` `^0.487.0` → `^1.57.0` (latest 1.x). No source change: every icon the app
  imports exists in 1.57.0 under the same name. Upstream's documented breaking change
  (https://lucide.dev/guide/react/migration) is the removal of brand icons; the app uses none.
- Deferred: renaming the legacy alias imports to their canonical names (Loader2 → LoaderCircle,
  AlertTriangle → TriangleAlert, AlertCircle → CircleAlert, Trash2 → Trash, ImageIcon → Image,
  CheckIcon → Check, XIcon → X, ChevronDownIcon/ChevronUpIcon → ChevronDown/ChevronUp).
  Premise: the aliases still resolve in 1.x. Reopen when a lucide-react release drops them.
- Accepted behaviour change (probe, diff of dist/esm/Icon.mjs against 0.487.0; spot-checked
  `hasA11yProp` at node_modules/lucide-react/dist/esm/Icon.mjs:43): an icon with no aria-*, role,
  title or children now renders `aria-hidden="true"`. Icon-only controls had no accessible name
  from the svg before either. Generated class names change (`lucide-<canonical>` plus aliases);
  nothing in src/ or the tests selects on `lucide-*` classes.

## Verification (2026-10-15, CachyOS, Node v24.18.1, main checkout with .env.local)
- yarn.lock: `lucide-react@^1.57.0` → 1.57.0, single entry.
- npx tsc --noEmit -p .: exit 0, 0 errors.
- yarn test:run: Test Files 65 passed | 1 skipped (66); Tests 466 passed | 1 skipped (467); exit 0.
- yarn lint: exit 0, 15 problems (0 errors, 15 warnings): master's five files, plus the same five
  inside each of the two probe worktrees under `.claude/worktrees/`, which neither .gitignore nor
  the ESLint config ignores. After removing the lucide probe worktree, the TS 6 worktree remains.
- yarn build: exit 0 (25/25 static pages).
- yarn audit: braces only, unchanged.

## End-to-end and visual checks
- Dev server restarted by the user on this branch: curl / /login /icon-192.png → 200.
- yarn test:e2e: 18 passed, 16 failed, 4 did not run (1.5m). Failing list compared with the master
  baseline: 0 new, 0 fixed, 16 in both.
- Glyph diff of the 24 imported names, 0.487.0 (`npm pack`) against 1.57.0 (icon node paths,
  `key` fields ignored): 5 redrawn — Trash2 (now the alias of `trash`), MonitorPlay, Zap, Upload,
  Trophy; the other 19 are identical. Rendered side by side at 64px: each keeps its shape; the
  differences are small path refinements, hard to tell apart at that size.
- Browser (Playwright MCP): `/` renders Zap, Trophy and QrCode; console 0 errors, 2 warnings
  (Supabase "Multiple GoTrueClient instances", pre-existing, below).

## Dev server log, observed during this branch's run (out of scope, pre-existing)
`.next/dev/logs/next-development.log` after the restart and the E2E run, WARN/ERROR grouped:
- 302 WARN (151 Browser, 151 Server mirrors) "Multiple GoTrueClient instances detected in the same browser context" (browser,
  mirrored by the server). Several Supabase clients share one auth storage key: the auth client
  (`src/infrastructure/auth/supabase-auth-client.ts`, created per call in the admin layout, login
  page and storage), plus `createClient` in `src/infrastructure/realtime/presence-tracker.ts:316`
  and `supabase-realtime-client.ts:235`. This branch changes no source file.
- 2 ERROR events, each logged by Browser and Server, "Login error: AuthApiError: Invalid login credentials" from the login page's
  console.error: the admin-auth E2E test submits wrong credentials on purpose.
- 1 WARN: the `middleware` file convention is deprecated in Next 16; rename to `proxy`.

## Review
- task-reviewer on b9e72de: APPROVED, 0 critical, 0 important. Tamper check: HEAD and status of
  the main checkout and the TS 6 worktree, and the ledger listing, unchanged.
- Minors fixed above: 24 distinct imported names (not 26; 19 unchanged, 5 redrawn, re-derived by
  the reviewer), exact log counts.
- Minor 3, recorded as a follow-up (pre-existing on master, not caused by the upgrade): icon-only
  controls with no accessible name (no aria-label, title or sr-only text) —
  create-question-dialog.tsx:211-216 (remove option), edit-question-dialog.tsx:239-244,
  image-upload.tsx:178-185 (remove image), question-list.tsx:127-139 (edit and delete),
  admin/quizzes/[quizId]/page.tsx:55-57 (back link). all-questions-view, quiz-list, media-library
  and the dialog close button have names.

PR #69 opened with the approved text (user: "approve"); work index line added. Merge waits for the user.
