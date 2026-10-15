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
