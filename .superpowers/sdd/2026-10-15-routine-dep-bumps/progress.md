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
- Dev server restarted by the user on f0fe436 deps: curl / /login /icon-192.png → 200.
- yarn test:e2e: 18 passed, 16 failed, 4 did not run (1.3m). Failing list compared with the master baseline (trailing whitespace stripped): 0 new, 0 fixed, 16 in both.

No findings record: nothing was measured beyond the standard checks; the two Dependabot problems (#43 splitting react from react-dom, #47 targeting Node 25) are rulings above.

## Review
- task-reviewer on 79e8b93: APPROVED, 0 critical, 0 important, 3 minor. Tamper check: HEAD and clean status unchanged, ledger dir listing unchanged.
- Minor 1 (lint list): the 5 warnings are no-html-link-for-pages at src/app/(admin)/admin/layout.tsx:49, no-img-element at src/components/host/live/question-view.tsx:69, and import/no-anonymous-default-export in three tests/load/*.js files. The branch changes no file under src/ or e2e/ and no ESLint package, so none can be new.
- Minor 2 (new transitive tree): @tanstack/query-devtools 5.104.3 now declares solid-js, @kobalte/core, @solid-primitives/*, goober and others as dependencies (5.100.9 had none); 49 new lock entries in the diff. The devtools render only when NODE_ENV !== production, through dynamic(..., { ssr: false }) at src/app/providers.tsx:9-14 and :46.
- Minor 3 (Node drift): local checks ran on Node v24.18.1; CI runs Node 22 and will run lint, unit tests and build on the PR.
- Reviewer gap closed: all 31 @radix-ui packages with a react peer accept ^19.0 (3 have no react peer).
