# Admin media API — ledger

Plan `docs/progress/plans/2026-10-15-admin-media-api-plan.md`, spec
`docs/progress/plans/2026-10-15-admin-media-api-design.md` (approved by the user 2026-10-16).
Branch `feat/admin-media-api` from origin/master 2ee229f, worktree
`.claude/worktrees/admin-media-api` (another session works in the main checkout). Execution:
subagent-driven, stop after each task (user-level workflow).

Baseline in the worktree (2026-10-16, after `yarn install --frozen-lockfile` and
`yarn prisma:generate`): `yarn test:run` 66 files passed / 1 skipped (67), 489 tests passed /
1 skipped (490), exit 0. The skip is `src/tests/integration/add-player.integration.test.ts`
(pre-existing).

## Plan check (plan-checker, opus pin, read-only) — plan at d84dafc

Verdict DEFECTS: 3 must-fix, 1 medium-low, 6 low. Tamper check clean (HEAD d84dafc, empty
porcelain before and after). Controller re-checked the three must-fix items in the code:
`image-upload.tsx:168-173` renders `next/image` with `next.config.ts` remotePatterns (no
`unoptimized`); `.prettierrc` printWidth 80; `src/app/api/admin/quizzes/route.ts:42` maps
`error.name === 'ZodError'` without importing it.

Rulings applied to the plan:
- Task 7 test 1 asserts on the `POST /api/admin/media` response, not the preview `src`; it now
  saves the question and checks the edit dialog keeps the image (the spec's "question shows it").
  Task 6 Step 4 reworded the same way. Correction 7.
- Task 1 code pre-wrapped to 80 columns; Step 5 runs `eslint --fix` first, and Prettier-only
  reformatting is a ruled correction for the transcribe byte-compare.
- Route maps `MediaValidationError` by `error.name` and imports nothing from
  `@application/use-cases/` (correction 4 amended), keeping the CLAUDE.md presentation rule.
- `media-library.tsx` uses `deleteFile.mutate`, not `mutateAsync` (the click handler does not
  await).
- `image-utils` test gains the "under the limit" case; the schema tests pin the `Invalid quiz ID`
  message, including a missing `quizId` (`z.string({ error })`). Task 1: 12 tests; totals 539
  after Task 4, 548 after Task 6.
- Stricter `quizId` regex listed as correction 5.
- ADR-025 dates the ruling 2026-10-15; the CLAUDE.md bullet is given as a fenced block.
- Rollout step 1 loads `.env.local` into the shell (`prisma.config.ts` reads only `.env`) and
  names `DIRECT_URL`.
- Beyond the report: the migration is wrapped in a `to_regclass('storage.objects')` guard,
  because `prisma migrate dev` replays migrations on a shadow database that may have no storage
  schema (correction 6). The checker had listed only the `IF EXISTS` notice as unverified.
- Task 4 Step 3 carries the checker's watch items (unexported helper, 204 via
  `new NextResponse(null, …)`, `GET()` without arguments, fresh `vi.fn()`s, non-multipart → 400).
