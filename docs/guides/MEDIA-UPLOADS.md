# Guide: Question Images (Media Uploads)

How a host attaches an image to a question, where it is stored, and who may change it. Rewritten
2026-11-12 for issue 128 (spec: `docs/progress/plans/2026-11-11-quiz-media-owner-design.md`,
decision ADR-028); the earlier version described a flow that never existed (issue 80).

## The rule

Only the server writes to storage. The browser never calls the Supabase Storage API to upload or
delete: it sends the file to an API route, the route checks that the signed-in host owns the
quiz, and the server writes with the service-role key. The `quiz-media` bucket has one policy
left, public read, so a user session with the anon key can read images but cannot write any.

## Where files live

- Bucket `quiz-media` (public), one folder per quiz: `questions/<quizId>/<file>`.
- A file belongs to the quiz whose folder it sits in, so its owner is that quiz's owner. Nothing
  else records ownership.
- File names are made on the server: `<timestamp>-<random>.<ext>`, with the extension taken from
  the detected image type, never from the uploaded name.
- Deleting a quiz deletes its folder first (`DeleteQuizUseCase`), then sweeps it again after the
  row is gone.

## The flow

```
image-upload.tsx (resize in the browser)
  → hooks/use-quiz-media.ts
  → POST /api/admin/quizzes/[quizId]/media           (multipart field `file`)
  → upload-quiz-media.use-case.ts                    (owner, type, size, per-host cap)
  → infrastructure/storage/supabase-media-storage.ts (service role)
```

| Route | Does | Errors |
|---|---|---|
| `POST /api/admin/quizzes/[quizId]/media` | uploads one image to the quiz's folder; returns `{ url, path, name, size }` | 400 bad, wrong-type or too-large file, or host at the cap; 401; 404 |
| `DELETE /api/admin/quizzes/[quizId]/media/[fileName]` | deletes one file from the quiz's folder | 400 name isn't a media file name; 401; 404 quiz not owned or file missing |
| `GET /api/admin/media` | lists the files of every quiz the host owns, with `quizId` and `quizTitle` | 401 |

Each route reads the user with `getCurrentUserId()` (401 when none) and, for a quiz route, runs
the quiz owner guard: someone else's quiz is the same 404 as a missing one. The use cases are in
`src/application/use-cases/quiz-media/`; the rules in `src/domain/value-objects/media-file.ts`.

Screens:

- The create and edit question dialogs upload through `useUploadQuizMedia(quizId)` and save the
  returned `url` as the question's `mediaUrl`. Removing the image in a dialog only clears the
  field; the file stays until it's deleted in the library (parked: it counts toward the cap).
- The media library (`/admin/media`, `media-library.tsx`) lists through `useOwnerMedia()` and
  deletes through `useDeleteQuizMedia()`.

## Server-side checks

The browser's own checks (accepted types, a 10 MB pick limit, resizing) are conveniences; the
server repeats what matters and trusts none of it.

- **Type:** read from the file's first bytes: JPEG, PNG, GIF or WebP. Anything else is a 400. The
  object is stored with the detected content type, so a file labelled `image/png` that isn't one
  never lands on the project's storage domain.
- **Size:** at most 4 MB per file (`MAX_MEDIA_BYTES`); Vercel refuses bodies over 4.5 MB. The
  browser resizes to at most 1920×1080 as an 85% JPEG first (`src/lib/image-utils.ts`), so a
  real photo lands at a few hundred KB.
- **Per-host cap:** 200 files and 50 MB across all of a host's quizzes (`MAX_MEDIA_FILES_PER_OWNER`,
  `MAX_MEDIA_BYTES_PER_OWNER`). The upload counts before writing and again after; an upload that
  finds itself over the cap, or its quiz gone, removes its own file. The cases this leaves open
  are listed in the spec under "Per-host cap".
- **A question's image URL:** creating or changing a question's `mediaUrl` must point at a file
  in that quiz's own folder (`assert-quiz-media-url.ts`); an outside URL or another quiz's file
  is a 400. An unchanged older value still saves.

## Storage policies

Expected state in both Supabase projects: exactly one policy in the whole `storage` schema (on
`objects`; `buckets` has none). Checked 2026-11-12 on dev for the whole schema, and on production
for `storage.objects`.

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage';
-- objects | Public read access for quiz media | SELECT | {public} | (bucket_id = 'quiz-media'::text)
```

The service role bypasses RLS, so the routes need no write policy. Don't add an INSERT, UPDATE or
DELETE policy for `authenticated`: with host sign-ups open, any account could then write into any
quiz's folder from the browser.

To confirm a non-owner can't write on dev, run `yarn media:check-non-owner` (needs `.env.local`
with the service-role key and both test admins; it prints the first characters of the project
host it ran against). It plants a file in a quiz folder the main admin owns, signs in as
`TEST_AUTH_ADMIN_*` with the anon key, tries an upload, an overwrite, a move and a delete, and
checks the files afterwards with the service-role key. Exit 0 means every write was refused.
Checking the files is the point: a delete the policies refuse still returns no error with 0
objects removed. The script probes the writes the app could be exposed to; the `pg_policies`
query above is the full check.

## Displaying images

Questions show `mediaUrl` through `next/image`; `next.config.ts` allows
`https://*.supabase.co/storage/v1/object/public/**`.

## Tests

- Use cases: `src/tests/application/use-cases/quiz-media.use-case.test.ts` (cap and race cases
  with an in-memory bucket); routes: `src/tests/app/api/admin-media-routes.test.ts` (owner, other
  host, no session).
- Hook: `src/tests/hooks/use-quiz-media.test.ts`.
- E2E: `e2e/admin-media.spec.ts` uploads a question image as the owner, finds it in the library
  under its quiz, and deletes it.

## Troubleshooting

- **Uploads, deletes, the media library and quiz deletion all answer 500 "Media storage is not
  configured":** `SUPABASE_SERVICE_ROLE_KEY` is missing in that environment (deleting a quiz
  removes its media folder first). It fails loudly by design.
- **"Media limit reached":** the host is at 200 files or 50 MB; delete files in the media library.
- **"Invalid media: the image must be a file uploaded to this quiz":** the question's image URL
  points outside the quiz's folder; upload the image again through the dialog.
- **Image doesn't display:** check `mediaUrl` in the database and the `remotePatterns` entry in
  `next.config.ts`.
