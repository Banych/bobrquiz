# Task 3 report: service-role storage adapter

## Status
DONE

## Implemented
`SupabaseStorageService implements IStorageService` in `src/infrastructure/storage/supabase-storage-service.ts`. Bucket `quiz-media` as a constant. A private `bucket()` helper calls `getSupabaseServerClient()`, throws `Storage is not configured` if null, else returns `client.storage.from(BUCKET)`; all four methods use it. upload throws the Supabase error as is and returns `{path: input.path, url}`. delete throws the error, or `Media file ${path} not found` on empty/null data. list maps like the old adapter (placeholder filtered, `size ?? 0`, `created_at ?? now`, path `prefix ? prefix/name : name`). No `any`, no casts; types inferred from supabase-js.

## Commits
```
commit fe11a1b322abae68380379d8bb44922385e934d4
    feat(media): add service-role storage adapter

 .../storage/supabase-storage-service.ts            |  64 ++++++++++
 .../storage/supabase-storage-service.test.ts       | 132 +++++++++++++++++++++
 2 files changed, 196 insertions(+)
```

## Tests
RED (`yarn test:run src/tests/infrastructure/storage/supabase-storage-service.test.ts`, piped through tail so the exit shown was zsh pipestatus = 1):
`Error: Cannot find package '@infrastructure/storage/supabase-storage-service'` / ` Test Files  1 failed (1)` / `Tests  no tests`

GREEN (same command, no pipe): ` Test Files  1 passed (1)` / `Tests  8 passed (8)`, exit 0.

eslint --fix: ran on both files, exit 0; it reformatted only the test file (Prettier wrapping to 80 columns; content unchanged). The implementation file was unchanged.

Step 5: `yarn tsc --noEmit && yarn eslint <both files>`: both `Done`, exit 0.

Full suite `yarn test:run`:
```
 Test Files  70 passed | 1 skipped (71)
      Tests  529 passed | 1 skipped (530)
exit 0
```

## Files changed
- src/infrastructure/storage/supabase-storage-service.ts (new)
- src/tests/infrastructure/storage/supabase-storage-service.test.ts (new)

## Self-review
Matches the brief and rulings 1-6. The report file in `.superpowers/` is not staged. Old adapter and server client untouched.

## Departures
None.

## Fix round 1
Commit b695cba `test(media): cover storage adapter error paths` (2 files, 58 insertions, 1 deletion).
- Adapter: `upload` now builds the URL from the same bucket (`bucket.getPublicUrl(path).data.publicUrl`), so the client resolves once per upload. `getPublicUrl` still goes through the helper.
- Tests: four added after the existing ones (list prefix path, list error passthrough, remove error passthrough, getPublicUrl without client). Existing tests unchanged.
- Commands (no pipes for the first runs): `yarn tsc --noEmit` exit 0; `yarn eslint --fix` and `yarn eslint` on both files exit 0 (a first attempt with a quoted single argument failed with exit 2 and was rerun); one file: Test Files 1 passed (1), Tests 12 passed (12), exit 0; full: Test Files 70 passed | 1 skipped (71), Tests 533 passed | 1 skipped (534), exit 0. After eslint --fix the tests were rerun (summary lines grepped, same counts; a separate full run exited 0).
