# Admin media through API routes — design

**Date:** 2026-10-15
**Status:** Approved design, pending implementation plan
**Branch:** `feat/admin-media-api` (from `origin/master` at 2ee229f)

## Why

1. **The `quiz-media` storage policies let any signed-in user upload and delete.** Both Supabase
   projects carry "Authenticated users can upload/delete quiz media" on `storage.objects`
   (`docs/progress/findings/2026-10-15-storage-policies-any-user.md`). The admin check
   (`ADMIN_EMAILS` in `src/proxy.ts`) only guards the app's own pages and `/api/admin/*`; a direct
   Storage API call with any session bypasses it. Today this is safe only because signups are off
   in both projects and every account is an admin.
2. **Presentation imports infrastructure.** `media-library.tsx`, `create-question-dialog.tsx` and
   `edit-question-dialog.tsx` call `createStorageService()` from
   `@infrastructure/storage/supabase-storage` in the browser. The user ruled these violations
   (2026-10-15; `.claude/skills/architecture-check/FINDINGS.md`, the gap entry).

This is the first of three pieces, in the order the user agreed: (1) this spec, storage;
(2) moving the realtime interfaces (`RealtimeClient`, `IPresenceTracker`) to the application
layer, its own spec; (3) extending `architecture-check` to `src/app`, `src/components` and
`src/hooks`, last, so it lands clean.

## Decisions (user, 2026-10-15)

- **Uploads go through an API route** (multipart POST, the server uploads), not signed upload
  URLs. The browser already resizes every image to at most 1920×1080 JPEG at 0.85 quality
  (`src/lib/image-utils.ts` `resizeImage`), far below Vercel's 4.5 MB request body limit, and the
  server sees the bytes it accepts.
- **Interfaces for outside services live in `src/application/ports/`.** Repository interfaces
  stay in `src/domain/repositories/`. Recorded as ADR-025; the realtime spec follows it.
- **The existing bugs stay out of scope**, filed as #78 (images never deleted from storage), #79
  (media library lists only the bucket root) and #80 (MEDIA-UPLOADS.md describes a flow that does
  not exist; closed by this work's docs).

## 1. Components

### Application

- **Port** `src/application/ports/storage-service.ts`:
  ```ts
  export type StoredObject = { path: string; url: string };
  export type StorageListEntry = { name: string; path: string; size: number; createdAt: string };

  export interface IStorageService {
    upload(input: { path: string; body: ArrayBuffer; contentType: string }): Promise<StoredObject>;
    delete(path: string): Promise<void>;
    list(prefix?: string): Promise<StorageListEntry[]>;
    getPublicUrl(path: string): string;
  }
  ```
  Server-shaped: an `ArrayBuffer`, not a browser `File`; the bucket (`quiz-media`) is fixed in
  the implementation, not passed per call.
- **DTOs** in `src/application/dtos/media.dto.ts` (existing `MediaFileDTOSchema` kept):
  - `MEDIA_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const` and
    `MEDIA_MAX_UPLOAD_BYTES = 4 * 1024 * 1024`, shared by the use case and the browser check.
    `src/lib/image-utils.ts` `isValidImageType` uses `MEDIA_ALLOWED_TYPES` instead of its own
    list (presentation may import `@application/dtos/*`).
  - `UploadMediaInputSchema` (`quizId: z.string().min(1)`), `UploadMediaResultDTOSchema`
    (`{ url, path }`), `DeleteMediaInputSchema` (`path: z.string().min(1)`).
- **Use cases** in `src/application/use-cases/`:
  - `UploadMediaUseCase.execute({ quizId, file: { bytes, contentType, size } })`: rejects a type
    outside `MEDIA_ALLOWED_TYPES` and a size over `MEDIA_MAX_UPLOAD_BYTES`; builds the path
    `questions/<quizId>/<Date.now()>-<random>.<ext>` with the extension from the content type
    (`jpg`, `png`, `webp`, `gif`), never from the file name; calls `upload` and returns
    `UploadMediaResultDTO`.
  - `ListMediaUseCase.execute()`: `list()` mapped to `MediaFileDTO[]` with `getPublicUrl`.
    Lists the bucket root, as today (#79 tracks the rest).
  - `DeleteMediaUseCase.execute({ path })`: rejects a path that is empty, starts with `/` or
    contains `..`; calls `delete`.
- **Service** `mediaService` in `src/application/services/factories.ts`, declared and wired like
  `questionService` (`upload`, `list`, `delete`), constructed with the storage adapter.

### Infrastructure

- `src/infrastructure/storage/supabase-storage.ts`: `SupabaseStorageService implements
  IStorageService` (from `@application/ports/storage-service`) on the service-role client from
  `getSupabaseServerClient()` (`src/infrastructure/realtime/supabase-server-client.ts`, unchanged;
  imported, not moved, so no capable-tier file changes). Bucket `quiz-media`, `upsert: false`,
  `cacheControl: '3600'`. When the client is `null` (no service-role key), each method throws
  `Storage is not configured`. `delete` throws `Media file <path> not found` when `remove`
  reports no object removed (it does not error on a missing path; see Assumptions).
- `src/infrastructure/storage/storage-service.ts` and the browser `createStorageService()` are
  deleted. No compatibility shim.

### Routes (all under `/api/admin/media`, so `src/proxy.ts` makes them admin-only)

`src/app/api/admin/media/route.ts`:
- `POST`: `request.formData()`; `file` must be a `File`; `quizId` parsed with
  `UploadMediaInputSchema`; the file becomes `{ bytes: await file.arrayBuffer(), contentType:
  file.type, size: file.size }`; returns 201 `UploadMediaResultDTO`.
- `GET`: returns `MediaFileDTO[]`.
- `DELETE`: JSON body parsed with `DeleteMediaInputSchema`; returns 204.

### Presentation

- `src/hooks/use-media.ts`: `mediaQueryKey = () => ['admin', 'media'] as const`;
  `useMediaLibrary()` (list query plus delete mutation that invalidates the key) and
  `useUploadMedia()` (mutation posting `FormData`). Fetch errors follow the CLAUDE.md pattern;
  a 413 maps to the same message as the server's size error.
- `media-library.tsx`, `create-question-dialog.tsx`, `edit-question-dialog.tsx` use the hooks
  and import nothing from `@infrastructure/*`.
- `image-upload.tsx` keeps its type check, 10 MB check on the picked file and resize, and adds a
  check after resizing: a resized file over `MEDIA_MAX_UPLOAD_BYTES` shows "Image must be 4 MB or
  smaller after resizing" and is not sent. The check is a plain function in `image-utils.ts` so
  it can be unit-tested.

## 2. Data flow and errors

Upload: pick → type and 10 MB check → resize to JPEG → 4 MB check → `useUploadMedia` POST →
route → `UploadMediaUseCase` → `SupabaseStorageService.upload` → `{ path, url }` → the dialog sets
`mediaUrl` → the question saves the URL, as today (storing the path is #78).

List and delete: `useMediaLibrary` GET → `ListMediaUseCase` → `MediaFileDTO[]` with public URLs.
Delete keeps today's `confirm()`, sends `{ path }`, invalidates the list.

| Condition | Response | Admin sees |
|---|---|---|
| No `file`, bad `quizId`, type not allowed, over 4 MB, bad delete path | 400 | the use case's message, e.g. "Image must be 4 MB or smaller" |
| Storage reports the object missing on delete | 404 | "… not found" |
| Body over Vercel's 4.5 MB limit | 413 (platform, before our code) | the 4 MB message, mapped in the hook |
| No service-role key, other Storage failure | 500, message logged on the server | "Unable to upload image" / "Unable to delete image" |
| Not signed in / not an admin | 401 / 403 (`src/proxy.ts`) | the existing redirect or error |

Today's unhandled rejection in `MediaLibrary.handleDelete` goes away: the mutation's error is
shown. Out of scope: sniffing the real file type from its bytes (the type is the
browser-declared one, as the bucket's own allowlist uses; all callers are admins).

## 3. Policy migration and rollout

Prisma migration `src/infrastructure/database/prisma/migrations/<timestamp>_restrict_quiz_media_writes/migration.sql`:

```sql
DROP POLICY IF EXISTS "Authenticated users can upload quiz media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete quiz media" ON storage.objects;
```

Public read stays. Writes then work only through the service-role key, which bypasses RLS. No
replacement policy: "admins only" lives in the app, and a policy keyed on admin emails would
duplicate `ADMIN_EMAILS` in the database. `schema.prisma` does not change.

**Fallback** if the migration role may not drop policies on `storage.objects` (owned by
Supabase's storage admin): the same SQL run in each project's SQL editor, written into the plan
and `MEDIA-UPLOADS.md` as a manual step, and the migration file dropped.

Rollout, code before policy (dropping the policies first would break the old browser uploads in
between):
1. Merge; Vercel deploys the routes.
2. Dev: `npx prisma migrate deploy --schema ./src/infrastructure/database/prisma/schema.prisma`
   with `.env.local` (no yarn script covers `migrate deploy`).
3. Verify on dev (section 4).
4. Production: the user applies it (its `DATABASE_URL` is Sensitive in Vercel), by
   `migrate deploy` or the SQL editor; then the production checks.
5. Follow-up commit: drop CLAUDE.md pitfall 4 (keep signups off) once production is done; add a
   dated note to the findings record.

## 4. Testing and verification

Unit tests, written with each task (CLAUDE.md "Testing"):

| What | Where | Cases |
|---|---|---|
| `UploadMediaUseCase` | `src/tests/application/use-cases/` | success; path shape; extension from content type; type not allowed; over 4 MB |
| `DeleteMediaUseCase` | same | success; empty path; leading `/`; `..`; not-found message from the port |
| `ListMediaUseCase` | same | maps to `MediaFileDTO` with public URLs; empty bucket |
| `SupabaseStorageService` | `src/tests/infrastructure/storage/` | bucket `quiz-media`; `upsert: false`; `Storage is not configured` on a null client; Supabase errors passed through |
| Media routes | `src/tests/app/api/` | POST multipart success and 400s; GET; DELETE 204 and 404 mapping |
| `use-media` | `src/tests/hooks/` | key factory; 413 → size message (no jsdom: no rendering) |
| After-resize check | `src/tests/lib/` | at, under and over the limit |

E2E `e2e/admin-media.spec.ts` (dev project): an admin uploads a small fixture image in the
create-question dialog, sees the preview, saves, and the question shows it; a second test deletes
a file from the media library. Each test removes what it uploaded.

Verified on the real target, after the dev migration, into a findings record:
1. A large phone-sized photo uploads through the app; the resized request size is recorded
   (the "under 4.5 MB" assumption).
2. A direct Storage API upload and delete with an **admin's** session, bypassing the app, fail
   with an RLS error.
3. An existing public image URL still loads.
4. Whether the migration role could drop the policies.
Production: checks 2–3 after the user applies its migration.

Agents: `src/infrastructure/storage/**` and the files above are not capable-tier, so tasks go to
`implementer` and `task-reviewer` (or `implementer-transcribe` where the plan carries the code).

## Records

- ADR-025 in `docs/DECISION-LOG.md`: outside-service interfaces in `src/application/ports/`;
  CLAUDE.md's layer section names the folder.
- `docs/guides/MEDIA-UPLOADS.md` rewritten to the real flow (closes #80); `docs/ARCHITECTURE.md`
  storage lines updated.
- `.claude/skills/architecture-check/SKILL.md`: the Assumed bullet's three admin storage imports
  are gone; the realtime ones remain for piece 2.

## Assumptions — check first

- A resized upload stays well under 4.5 MB (real-target check 1).
- The `DATABASE_URL` role may drop policies on `storage.objects` (real-target check 4; fallback
  above).
- supabase-js `storage.from(bucket).remove([path])` on a missing path resolves with an empty
  `data` array rather than an error (from memory of the API, not checked; the adapter test and
  real-target check 2 settle it).
- `request.formData()` in a Next 16 route handler on Vercel's Node runtime receives the resized
  file intact (unit tests use a constructed `FormData`; the e2e run covers the real path).
