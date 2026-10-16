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

## Execution (2026-10-16)

User approved the plan 2026-10-16 ("plan is ok, subagent driven"); kept the old main-checkout
draft (`.superpowers/drafts/2026-10-15-storage-policies-any-user.md`), not deleted.

### Pre-flight conflict scan (controller, plan at 85d1efd)

| Rows | Produces → consumes | Found |
|---|---|---|
| T1 → T2 | `IStorageService` (4 methods), `MediaValidationError`, `MEDIA_*`, `UploadMediaInputSchema`, `DeleteMediaInputSchema` → use cases and the `satisfies Record<keyof IStorageService>` mock | agree |
| T1 → T3 | `StoredObject`, `StorageListEntry` → adapter return shapes; T3 list test expects `{name,path,size,createdAt}` | agree |
| T1 → T4 | input schemas → route validation; `Invalid quiz ID` before the use case | agree |
| T1 → T5 | `MEDIA_TOO_LARGE_MESSAGE` → 413 mapping | agree |
| T1 → T6 | `isWithinUploadLimit(Blob)` → after-resize check; the after-resize copy is a literal in T6, not a T1 constant | agree |
| T2 ↔ existing | `MediaFileDTOSchema` fields `name,path,url,size,createdAt` (media.dto.ts) → T2 list test | agree |
| T2/T3 → T4 | three use cases + `SupabaseStorageService()` no-arg ctor → `MediaService` | agree |
| T4 → T5 | POST 201 JSON, GET 200, DELETE 204 empty body → hooks (delete must not parse a body) | agree |
| T3 → T6 | T3 only reads the old adapter; T6 deletes it | agree (correction 1) |
| T6 → T7 | preview `alt="Uploaded image"` (`image-upload.tsx:170`) → e2e locator | agree |
| T6 → T8 | admin storage components gone → architecture-check Assumed bullet | agree |
| T1 self | 8 + 4 = 12 tests; `''` fails the regex with the message; missing key hits `z.string({ error })` (zod ^4.4.3, v4 syntax); `media.dto.ts` already imports `z` | agree |
| T2 self | 12 + 2 + 6 = 20 tests; validation order quizId → type → empty → size | agree |
| T3 self | 5 + 3 = 8 tests | agree |
| T4 self | 10 tests; totals 489 + 12 + 20 + 8 + 10 = 539, 66 + 5 = 71 files | agree |
| T5 self | 9 tests; 548 / 72 after T6 (T6 adds no tests) | agree |
| T8 self | migration replaces no schema change; Step 3 checks it | agree |

Scan clean; no new rulings.

### Task 1 — port, DTOs, shared limits (implementer-transcribe, haiku pin)

BASE 85d1efd. Report `task-1-report.md`. Commit 75631a2 `feat(media): add storage port and media
DTOs`, 8 files (the brief's Step 6 list exactly; nothing under `.superpowers/` staged).

- RED (implementer): 2 files failed, 11 failed / 1 passed. The pass is the `isValidImageType`
  case, which characterises a function that already existed; expected.
- Byte-compare (controller, brief blocks vs commit): the four new files (`storage-service.ts`,
  `media-validation-error.ts`, both test files) are `diff`-identical to the brief; the
  `media.dto.ts` append, ADR-025 and the CLAUDE.md Ports bullet match their blocks line for line;
  `image-utils.ts` matches the brief's prose (import at top, `isValidImageType` as an expression
  arrow, `isWithinUploadLimit` added next to it). No Prettier reformatting happened, so not even
  the ruled correction was needed. Per-task review skipped under the user-level transcribe
  exception; the end-of-branch passes cover it.
- Controller re-checks: `yarn eslint <the six paths>` exit 0, `yarn tsc --noEmit` exit 0.
- Verdict (`yarn test:run`, main session): first run after the hand-back gave
  `Test Files 1 failed | 67 passed | 1 skipped (69)`, `Tests 1 failed | 500 passed | 1 skipped
  (502)`, exit 1; its failure lines were not captured (only `tail` was kept). The next 17 runs
  (1 + 10 sequential + 6 as 3 concurrent pairs) all gave `68 passed | 1 skipped (69)`,
  `501 passed | 1 skipped (502)`, exit 0. Expected 68 / 501 after Task 1: met. The one failure
  is unidentified (Why: unknown). It may have overlapped the implementer's last commands, but
  that is not shown. If it recurs, capture the full output before re-running.
- Doc sweep: decision → ADR-025 (in the commit). Findings → none beyond the flake above, kept
  here. Conventions → none. CLAUDE.md → the test table now names `src/tests/application/dtos/`,
  the new home of DTO schema tests (controller edit, committed with this entry).

Task 1: complete (commits 85d1efd..75631a2, byte-compare clean, review skipped per transcribe exception)

### Task 2 — use cases (implementer, sonnet pin)

BASE b9e8da0. Report `task-2-report.md`. Commit d45ea0b `feat(media): add upload, list and
delete use cases`, 4 files (the brief's three use cases and one test file).

Dispatch rulings (on points the brief left open): `UploadMediaInput` exported from
`upload-media.use-case.ts`; quizId via `UploadMediaInputSchema.safeParse` → `MediaValidationError`;
suffix always ≥ 6 lowercase base-36 characters (implementer used 8 hex chars of
`crypto.randomUUID()`); extension through `Record<MediaContentType, string>`; list at the bucket
root (#79 out of scope); delete passes port errors through; Task 1 constants, not literals.

- Controller checks: the committed test file is `diff`-identical to the brief's test block after
  `yarn prettier` on the extract. Verdict `yarn test:run` (main session): `Test Files 69 passed |
  1 skipped (70)`, `Tests 521 passed | 1 skipped (522)`, exit 0 — matches the expected
  501 + 20.
- Review (task-reviewer, sonnet pin): spec ✅, quality Approved, no Critical/Important, 2 Minor.
  Tamper check clean (HEAD d45ea0b, empty porcelain before and after, ledger-directory sha256sums
  identical).
- Ruling: Minor "empty and size checks trust `file.size`, not `file.bytes.byteLength`" — no
  change. Premise: Task 4's route builds `size` and `bytes` from the same `File` (`file.size`,
  `await file.arrayBuffer()`), so they cannot disagree; the brief's interface carries `size` and
  the Task 4 route test asserts it. Carried into the Task 4 dispatch. Reopen if any caller builds
  them separately. Cost if wrong: a caller passing a small `size` with large bytes would bypass
  the 4 MB check (the 4.5 MB platform limit still caps the request).
- Ruling: Minor "`includes('..')` also rejects names like `a..b.jpg`" — no change; the plan's
  Step 3 prescribes the check, and generated names never contain `..`. Dev bucket checked
  (`SELECT name FROM storage.objects WHERE bucket_id = 'quiz-media'`, 2026-10-16): 2 objects,
  `questions/cmmhy4vfs0000pcu7frbdhusv/1773495000674-wjunzikevzc.png` and
  `questions/cmmgrpdra000004ky9on9gtyi/1772914913867-xme6kml0dw.jpg`, neither contains `..`.
  Production not checked (needs the user's permission). Cost if wrong: an existing object with
  `..` in its name could not be deleted through the API.
- Doc sweep: no decision, findings, convention or CLAUDE.md change beyond this entry.

Task 2: complete (commits b9e8da0..d45ea0b, review clean, 2 minors ruled no-change)
