# Routine dependency bumps — ledger

Branch `chore/routine-dep-bumps`, cut from `origin/master` at 610137b (after PR #66).
Bounded work, design approved in chat (user: "go", 2026-10-15): do the routine Dependabot bumps
ourselves instead of merging the stale May–August PRs, with the same checks as the two
security branches.

## Scope and rulings
- Upgraded to the latest within the current majors (`yarn outdated`, 2026-10-15):
  @tanstack/react-query and -devtools 5.100.9 → 5.104.3 (Dependabot #36), tailwind-merge 3.5.0 → 3.7.0 (#38),
  tw-animate-css 1.2.5 → 1.4.0 (#39), @playwright/test 1.59.1 → 1.64.1 (#42),
  react and react-dom 19.1.0 → 19.3.1, @types/react 19.1.0 → 19.3.0, @types/react-dom 19.1.2 → 19.3.0 (#43).
- Ruling: react-dom moves with react. #43 bumped react alone; React throws when react and
  react-dom versions differ.
- Ruling: @types/node `^20` → `^22.20.5`, not Dependabot #47's 25: CI runs Node 22
  (`.github/workflows/ci.yml` node-version '22'). Revisitable if CI or Vercel move to 24.
- Next 16.3.8 peers accept react/react-dom `^19.0.0` and @playwright/test `^1.51.1`.
- Out of scope (separate branches): typescript 6 (#44), lucide-react 1.x (#46), actions v7 (#50, #62).

## Lockfile
- Single copies: react 19.3.1, react-dom 19.3.1, @types/react 19.3.0, @types/react-dom 19.3.0,
  @tanstack/* 5.104.3, playwright/playwright-core 1.64.1.
- @types/node: 22.20.5 (direct) plus 24.10.1 nested under @types/pg (its `*` range, an existing
  entry; master had 20 + 24 the same way). tsc is clean with both.

## Verification (2026-10-15, CachyOS, Node v24.18.1)
- yarn prisma:generate: exit 0.
- npx tsc --noEmit -p .: exit 0, 0 errors.
- yarn test:run: Test Files 65 passed | 1 skipped (66); Tests 466 passed | 1 skipped (467); exit 0.
- yarn lint: exit 0, 5 problems (0 errors, 5 warnings); master also had 5 warnings (list not compared).
- yarn audit: braces GHSA-vfj7-8cjw-p6xm only (unchanged from master).
- yarn build: exit 0.
- yarn playwright install chromium: chromium-headless-shell v1248 downloaded, exit 0.
