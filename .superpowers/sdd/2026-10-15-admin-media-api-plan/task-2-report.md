# Task 2 report: media use cases

## Status
DONE

## Implemented
- `UploadMediaUseCase` (exports `UploadMediaInput`): validates quizId via `UploadMediaInputSchema.safeParse({ quizId })` ('Invalid quiz ID'), type via `MEDIA_ALLOWED_TYPES`, empty, size via `MEDIA_MAX_UPLOAD_BYTES`/`MEDIA_TOO_LARGE_MESSAGE`. Path `questions/<quizId>/<Date.now()>-<8 chars of crypto.randomUUID() without dashes>.<ext>`; ext from `Record<MediaContentType, string>`.
- `ListMediaUseCase`: `storage.list()` with no prefix, maps to `MediaFileDTO` with `getPublicUrl(entry.path)`.
- `DeleteMediaUseCase`: `DeleteMediaInputSchema.safeParse` + `startsWith('/')` + `includes('..')` all -> `MediaValidationError('Invalid media path')`; port errors pass through.

## TDD evidence
- RED: `yarn test:run src/tests/application/use-cases/media-use-cases.test.ts` -> `Error: Cannot find package '@application/use-cases/upload-media.use-case'`; `Test Files  1 failed (1)`, `Tests  no tests`, exit 1.
- GREEN: same command -> `Test Files  1 passed (1)`, `Tests  20 passed (20)`.

## eslint --fix
Changed `upload-media.use-case.ts` (wrapped the `execute` destructured parameter list over 80 columns) and `media-use-cases.test.ts` (Prettier wrapping). Formatting only; no logic change. Re-run after the fix: the same four files, exit 0.

## Step 5
- `yarn tsc --noEmit` -> exit 0
- `yarn eslint <4 files>` -> exit 0

## Full suite (`yarn test:run`, no pipe)
```
 Test Files  69 passed | 1 skipped (70)
      Tests  521 passed | 1 skipped (522)
exit 0
```

## Commit
d45ea0b feat(media): add upload, list and delete use cases (4 files changed, 263 insertions)
- src/application/use-cases/delete-media.use-case.ts
- src/application/use-cases/list-media.use-case.ts
- src/application/use-cases/upload-media.use-case.ts
- src/tests/application/use-cases/media-use-cases.test.ts

## Self-review
- No `any`; layer rules respected (imports only application ports/DTOs).
- Suffix always 8 lowercase hex chars (`[a-z0-9]`).
- No files beyond the brief's; nothing under `.superpowers/` staged except none (this report is unstaged).

## Deviations
None. The test file was written with the Write tool rather than a heredoc because the sandbox rejected the compound command; content identical to the brief.
