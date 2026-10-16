# Task 4 report

## Status
DONE

## Implemented
- `factories.ts`: `MediaService` type, `ServiceContainer.mediaService`, wiring from the three use cases on one `new SupabaseStorageService()`.
- `src/app/api/admin/media/route.ts`: POST/GET/DELETE, `dynamic = 'force-dynamic'`, one unexported `toErrorResponse(error, method, fallback)`. The `method` parameter is an addition to the ruling's `(error, fallback)` signature, so the log line reads `[API] <method> media error:`. ZodError matched with `instanceof`; MediaValidationError by `error.name` only.
- POST: size and bytes both from the one `File`; formData failure or non-File -> 400 `No image file provided`; 201 on success. DELETE: unparsable body -> 400 `Invalid media path`; 204 via `new NextResponse(null, ...)`.
- `quiz-routes.test.ts`: one line added (`mediaService`).

## TDD
- RED: `yarn test:run src/tests/app/api/media-routes.test.ts` -> `Error: Cannot find package '@/app/api/admin/media/route'`; `Test Files  1 failed (1)`, `Tests  no tests`, exit 1.
- GREEN: `yarn test:run src/tests/app/api/` -> `Test Files  2 passed (2)`, `Tests  14 passed (14)`, exit 0 (10 media + 4 quiz-routes).

## eslint --fix
`yarn eslint --fix src/application/services/factories.ts src/app/api/admin/media src/tests/app/api` exit 0. It reformatted (Prettier) route.ts (the `toErrorResponse` signature onto one line) and media-routes.test.ts (line wrapping). factories.ts and quiz-routes.test.ts unchanged.

## Step 5
- `yarn tsc --noEmit` -> exit 0
- `yarn eslint src/application/services/factories.ts src/app/api/admin/media src/tests/app/api` -> exit 0, no output
- `yarn test:run` -> `Test Files  71 passed | 1 skipped (72)`, `Tests  543 passed | 1 skipped (544)`, exit 0

## Files changed (commit 2f29557, `feat(media): add admin media API routes`)
```
 src/app/api/admin/media/route.ts       |  94 ++++++++++++++++++
 src/application/services/factories.ts  |  30 ++++++
 src/tests/app/api/media-routes.test.ts | 171 +++++++++++++++++++++++++++++++++
 src/tests/app/api/quiz-routes.test.ts  |   1 +
 4 files changed, 296 insertions(+)
```

## Self-review
- Route imports only `dtos/media.dto` and `services/factories` from `@application/`; no `MediaValidationError` import.
- Test bodies transcribed verbatim (Prettier wrapping only).
- UploadMediaInputSchema's parsed `quizId` is what is passed to the service.

## Deviations
- `toErrorResponse` takes a `method` argument (see above) to satisfy the `[API] <method> media error:` log format. Nothing else.

## Fix round 1
Added two tests at the end of the existing `describe` in `src/tests/app/api/media-routes.test.ts` (commit e73b35c, `test(media): cover malformed media request bodies`, 1 file, 28 insertions): POST with a JSON (non-multipart) body -> 400 `No image file provided`, upload not called; DELETE with body `not json` -> 400 `Invalid media path`, delete not called. No other file changed.

- `yarn eslint --fix src/tests/app/api/media-routes.test.ts` -> exit 0
- `yarn eslint src/tests/app/api/media-routes.test.ts` -> exit 0
- `yarn tsc --noEmit` -> exit 0
- `yarn test:run src/tests/app/api/` -> Test Files 2 passed (2); Tests 16 passed (16); exit 0
- `yarn test:run` -> Test Files 71 passed | 1 skipped (72); Tests 545 passed | 1 skipped (546); exit 0
The new tests were not run red first (they cover branches that already exist), so they are not shown to fail without the branch.
