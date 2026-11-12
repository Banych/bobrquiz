# Quiz media: only the quiz's owner can upload and delete (issue 128)

Status: In progress — part 1 merged in PR #160 and part 2 in PR #162 (both 2026-11-12); part 3
built on `feat/quiz-media-policy-drop`, with the storage write policies dropped on dev and
production and a production upload and delete checked through the UI (2026-11-12); done when
its PR merges

Size: this is near the ship profile's split line (about 8 steps, more than 10 files). If the plan
passes it, split into part 1 (routes, components, cap, URL check, tests) and part 2 (the policy
drop, the non-owner script and the docs), with `Closes` only on part 2. As built (2026-11-12) it
took three parts: part 1 the routes, cap and URL check; part 2 the admin components; part 3 the
policy drop, the non-owner script and the docs, with `Closes` only on part 3.

## Why

Issue 129 opens host sign-ups. Today any signed-in session can upload to or delete any object
in the `quiz-media` bucket by calling the Supabase Storage API with the public anon key: the
bucket's `authenticated` INSERT and DELETE policies check only the bucket name
(`docs/progress/findings/2026-10-15-storage-policies-any-user.md`). The app never sees those
calls, so the quiz-owner checks added for issue 127 don't cover them. Sign-ups were turned off
in both Supabase projects for this reason; they can't be turned back on until this is fixed.

The ruling recorded with that finding (2026-10-15) was to move the admin storage calls behind
API routes. This spec does that (option 1 in issue 128, chosen by the user on 2026-11-11).

## Goals

- Uploading a question image and deleting a media file go through the app's server, which
  checks that the signed-in user owns the quiz the file belongs to, and writes to storage with
  the service-role key.
- Nobody can write to or delete from `quiz-media` with their own session any more: the
  `authenticated` INSERT and DELETE policies are dropped in both Supabase projects.
- The media library shows and deletes only the signed-in host's files.
- One host can't fill the bucket: uploads stop at a fixed number of files per host (user's
  ruling, 2026-11-11).
- A question's image can only be a file from that quiz's own folder, not any web address
  (user's ruling, 2026-11-11).
- Players and question pages keep loading images from the same public URLs; existing questions
  and files need no change.

## Non-goals

- Moving or renaming existing files, or rewriting any question's `mediaUrl`.
- Deleting a file when its question is deleted, or warning that a file is still used by a
  question (today's behaviour stays: deleting a used file breaks that question's image).
  Deleting a quiz does delete its files (see the cap), which the first draft listed here.
- Cleaning up files left behind by quizzes deleted before this change. They stay in the
  bucket, owned by nobody, shown to nobody.
- Rate-limiting uploads or capping quizzes per host. Each upload lists one folder per quiz the
  host owns, so a host with very many quizzes makes each upload slow; parked.
- Refusing an upload with no `Content-Length`. Vercel refuses bodies over 4.5 MB before the
  route runs; this only matters if the app is ever self-hosted.
- The public SELECT policy. It lets anyone with the anon key list file names in the bucket; the
  files themselves are public by URL anyway. Parked, not changed here.
- Changing the client-side resize, the accepted image types or the upload UI.

## Anti-goals (a failure even if it works)

- A missing `SUPABASE_SERVICE_ROLE_KEY` makes uploads quietly do nothing or fall back to the
  browser session. It must fail loudly (a 500 with a clear message and a server log), unlike
  the realtime client, which returns `null` (issue 97).
- A route builds a storage path from caller text that can point outside
  `questions/<quizId>/` (a `..`, a slash, another quiz id).
- A non-owner can tell from a response that someone else's quiz or file exists. Same 404 as a
  missing quiz, as everywhere else since issue 127.
- The policies are dropped before the new code is deployed, so uploads break for the live site
  in between.

## Who owns a file

A file's owner is the owner of the quiz in its path. Uploads already go to
`questions/<quizId>/<timestamp>-<random>.<ext>`, so every file the app wrote is already in the
right place. Anything not under `questions/<quizId>/` (if older files exist at other paths)
belongs to nobody: no route lists or deletes it.

Nobody has looked at production's object paths (the finding counted dev's: two objects).
Rollout step 4 checks them before production's policies are dropped.

The media library today lists only the top level of the bucket (`listFiles` with no path), and
Supabase's list doesn't descend into folders, so it most likely shows one `questions` folder
entry and has never listed or deleted a real upload (inferred from the code, not run). Listing
and deleting the host's files is therefore new behaviour, not a regression to protect.

## API routes

All three live under `/api/admin`, so `src/proxy.ts` already requires a signed-in admin. Each
handler then reads the user with `getCurrentUserId()` (401 when none) and, for a quiz-scoped
route, runs the quiz owner guard (`assert-quiz-owner.use-case.ts`, 404 for a missing or
someone else's quiz), as the question routes do.

| Route | Does | Errors |
|---|---|---|
| `POST /api/admin/quizzes/[quizId]/media` | multipart form with one `file`; uploads to `questions/<quizId>/<server-made name>`; returns `{ url, path, size }` | 400 bad or missing file, wrong type, too large; 401; 404 |
| `DELETE /api/admin/quizzes/[quizId]/media/[fileName]` | deletes `questions/<quizId>/<fileName>` | 400 when `fileName` isn't a plain file name; 401; 404 (quiz not owned, or no such file) |
| `GET /api/admin/media` | lists the files under `questions/<quizId>/` for every quiz the user owns (`listQuizzesByOwner`) | 401 |

Upload rules, checked on the server (the browser's checks stay but aren't trusted):

- Type: `image/jpeg`, `image/png`, `image/webp`, `image/gif` (what `image-upload.tsx` accepts),
  read from the file's first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, GIF
  `GIF87a`/`GIF89a`, WebP `RIFF….WEBP`), not from the type the browser declares. A file whose
  bytes match none of them is a 400. The server stores the object with the content type it
  detected. (Spec author's call: without it, anyone who can sign up could host any file on the
  project's storage domain by labelling it `image/png`. No new dependency; a few lines plus
  tests with fake files.)
- Size: at most 4 MB. Vercel refuses request bodies over 4.5 MB; the browser resizes to
  1920×1080 at 85% JPEG before upload, so a real photo lands well under this.
- The file name is made on the server (same `<timestamp>-<random>.<ext>` shape, extension
  taken from the allowed type, not from the uploaded name).
- Per-host cap: 200 files and 50 MB across the folders of every quiz the host owns; past
  either, the upload is a 400 ("Media limit reached"). Nothing new is stored; the count comes
  from listing storage. Both numbers are constants in `media-file.ts`, not environment
  variables (spec author's calls, as is the 400 status).
  - The use case counts before the upload, and again after it with the new file included; an
    upload that finds itself over the cap then removes its own file. Uploads running at the
    same moment all pass the first count, so without the second one the cap could be passed
    by any number. With it the cap holds once they finish; near the cap, racing uploads may
    all be refused (amended 2026-11-11 after the security review found the race).
  - 50 MB (amended 2026-11-11, branch review): 200 files of up to 4 MB each would be 800 MB,
    close to what the reviewer recalled, unverified, as the Free plan's 1 GB storage. A
    browser-resized image is about 300 KB, so 200 of them fit.
  - Deleting a quiz deletes its folder first (`DeleteQuizUseCase`), because the cap counts
    only quizzes that exist: otherwise create, fill, delete, repeat escapes it. If removing
    the files fails, the quiz stays and the host can retry (amended 2026-11-11, security
    review).
  - An upload racing its own quiz's deletion (amended 2026-11-11, second review round): the
    check after the write also requires the quiz to still be the host's, and the delete
    sweeps the folder again after removing the row (logged, not thrown, if that fails). A
    write either lands before the second sweep lists the folder, and is removed by it, or
    its own check runs after the row is gone, and it removes itself. Any error in the check
    after the write removes the file too.
  - Left open, each logged where the code can see it: a function killed by its time limit
    between the write and the check keeps its file; a failed removal of a refused upload
    keeps its file; a failed second sweep after a quiz delete keeps any file written during
    the delete. Each needs a storage failure or a timeout, not just a request; closing them
    needs a per-host counter in the database or a sweep job. The time limit can be
    reached on purpose by owning very many quizzes (each count lists one folder per quiz),
    which the parked fan-out item covers.
- `fileName` in the DELETE route must match the server-made shape (letters, digits, `-`, one
  `.` and an allowed extension); anything else is a 400 before storage is called.

The list response items extend `MediaFileDTO` with `quizId` (and the quiz title, if the
builder finds it useful for the library; builder's call).

## A question's image URL

Today `mediaUrl` in `question-admin.dto.ts` accepts any URL. Once sign-ups open, a host could
point a question at an outside server that logs every player's IP, or at another host's file
(which breaks when that host deletes it).

From this change, the create and update question use cases accept a `mediaUrl` only when it is
`null` or the public URL of a file in that quiz's own folder: the Supabase public URL prefix for
`quiz-media` followed by `questions/<quizId>/` and a file name of the server-made shape. Anything
else is a 400. The prefix is built from the configured Supabase URL, not hard-coded.

An update that leaves `mediaUrl` unchanged is accepted even if the stored value doesn't match,
so a question saved before this change can still be edited without losing its image (spec
author's call). No stored data is rewritten.

The check belongs in the question use cases (they know the quiz id); the DTO keeps
`z.string().url()`.

## How it fits the layers

- A storage port (upload, delete, list a folder, public URL) that the use cases depend on,
  next to the repository interfaces they already use. The service-role implementation lives in
  `src/infrastructure/storage/` and is wired in `factories.ts`.
- Use cases in `src/application/use-cases/`: upload quiz media, delete quiz media, list the
  owner's media. The two quiz-scoped ones run the owner guard first. Their error messages
  contain "not found" where the route must answer 404.
- New DTOs and zod schemas in `src/application/dtos/media.dto.ts`; the upload body is a
  multipart form, so the route validates the `File` itself (type, size) rather than a JSON
  schema.
- The three admin components (`create-question-dialog.tsx`, `edit-question-dialog.tsx`,
  `media-library.tsx`) call the routes (a hook for the library list, per the TanStack Query
  pattern) and stop importing `@infrastructure/storage`. That clears three of the owed
  presentation → infrastructure imports listed in `CLAUDE.md`.
- The browser `SupabaseStorageService` is deleted once nothing imports it.

## Supabase changes (both projects)

The policies were created in the dashboard, not by a migration in this repo. Drop:

- `Authenticated users can upload quiz media` (INSERT, `authenticated`)
- `Authenticated users can delete quiz media` (DELETE, `authenticated`)

Keep `Public read access for quiz media` (SELECT, `public`). The service role bypasses RLS, so
the new routes need no policy. There is no UPDATE policy today; none is added.

Dev can be changed through the project's Supabase MCP server (after `/mcp` sign-in) or the SQL
editor; production only through its SQL editor, run by the user. Both are checked afterwards
with the `pg_policies` query from the finding.

## Acceptance (from the issue)

- [x] This spec picks one option (option 1).
- [x] On dev, a signed-in session that doesn't own the quiz, using the anon key, cannot upload
  to or delete from `quiz-media`. A rerunnable `tsx` script run with `.env.local`:
  1. plants a file in one of the main admin's quiz folders with the service-role key;
  2. signs in as the second test admin (`TEST_AUTH_ADMIN_*`) with the anon key and tries to
     upload next to it and to remove it;
  3. confirms with the service-role key that the planted file still exists and the attempted
     upload doesn't, then cleans up.

  Step 3 is required: when a policy denies a delete, Supabase's `remove()` returns success with
  an empty result, not an error, so "no error" proves nothing. A script rather than a
  Playwright spec, because `e2e/admin-auth.spec.ts` logs that account out of all its sessions
  and would race a parallel spec. (Spec author's call.)
- [x] The second test admin also gets 404 from the new routes on the main admin's quiz (route
  tests).
- [x] The owner's question-image upload works in the admin UI, and the media library lists and
  deletes that file (Playwright, new spec; the library had no working baseline).
- [x] The 201st upload by one host, an upload past 50 MB, and uploads racing past the cap are
  refused; deleting a quiz removes its files (use case tests with an in-memory bucket).
- [x] Creating or updating a question with an outside `mediaUrl`, or one from another quiz's
  folder, is a 400; an unchanged legacy value still saves (use case tests).
- [x] The policies are checked in both Supabase projects.
- [x] The finding gets a "Fixed" section; Common pitfalls item 2 in `CLAUDE.md` is updated.

Also in this change: route and use case tests for owner, non-owner and no-session paths;
`docs/guides/MEDIA-UPLOADS.md` rewritten to the real flow (closes issue 80); the `CLAUDE.md`
code map's Media line and owed-imports list updated; an ADR that storage writes go only
through the server.

## Rollout

1. Build and test against dev with the policies still in place (the routes don't need them).
2. Drop the two policies on dev; run the non-owner check and the e2e upload spec.
3. Merge and deploy; check a production upload and delete through the UI.
4. The user lists production's `quiz-media` object names that are not of the form
   `questions/<quizId>/<file>` and checks whether any question's `mediaUrl` points at one. Any
   such file becomes unmanageable from the app after this change; decide what to do with it
   before going on.
5. The user drops the two policies on production and runs the `pg_policies` check.
6. Only then is issue 128 done, and issue 129 may enable sign-ups.

## Left to the builder

- Where exactly the storage port lives and how it's named, within the layer rules.
- Whether the upload route reads the body with `request.formData()` or another way, as long as
  the 4 MB cap is enforced before the file reaches storage.
- Whether the library groups files by quiz.
- A new server-side Supabase client for storage, or a reworked one shared with realtime, as
  long as a missing service-role key fails loudly for storage (the realtime helper returns
  `null`).
