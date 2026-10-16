# Admin Media API Implementation Plan

**Status:** In progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin media upload, list and delete go through `/api/admin/media` and use cases on the server's service-role key, so the `quiz-media` write policies can be dropped.

**Architecture:** An `IStorageService` port in `src/application/ports/`, three use cases, a `mediaService` in the composition root, one route file with POST/GET/DELETE, and a `use-media` hook module the three admin components call instead of the browser storage client. A Prisma migration drops the two write policies; it is applied after the code is deployed.

**Tech Stack:** Next.js 16 route handlers, zod, TanStack Query, supabase-js storage (service role), Vitest, Playwright.

**Spec:** `docs/progress/plans/2026-10-15-admin-media-api-design.md`

## Global Constraints

- Bucket `quiz-media`; allowed types exactly `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Server upload limit `MEDIA_MAX_UPLOAD_BYTES = 4 * 1024 * 1024`; the picked-file limit in `image-upload.tsx` stays 10 MB.
- Upload path `questions/<quizId>/<Date.now()>-<random>.<ext>`, extension from the content type (`jpg`, `png`, `webp`, `gif`), never from the file name.
- Error copy, exact: `Image must be a JPEG, PNG, WebP or GIF` · `Image must be 4 MB or smaller` · `Image is empty` · `Invalid quiz ID` · `Invalid media path` · `No image file provided` · `Storage is not configured` · `Media file <path> not found` · `Image must be 4 MB or smaller after resizing`; 500 bodies `Unable to upload image` / `Unable to load media` / `Unable to delete image` (also the hooks' fallbacks).
- Upload `upsert: false`, `cacheControl: '3600'`.
- Presentation imports only `@application/dtos/*` (plus `@hooks`, `@lib`, `@ui`, `@components`); nothing from `@infrastructure/*` in the touched components.
- No `any`; no compatibility shim for the old browser storage client.
- Verdict command `yarn test:run`, run by the main session; baseline 66 files passed / 1 skipped, 489 tests passed / 1 skipped.

## Plan corrections to the spec (rulings, 2026-10-16)

1. **Adapter file name.** The server adapter is a new file, `src/infrastructure/storage/supabase-storage-service.ts`; the old `supabase-storage.ts` and `storage-service.ts` are deleted in Task 6, when their last callers go. Rewriting in place would break the build between Tasks 3 and 6.
2. **E2E delete.** The media library lists only the bucket root (#79), so a file uploaded under `questions/<quizId>/` never appears there. Delete is exercised through the API (Task 7), not the library UI.
3. **Media list polling.** `useMediaLibrary` uses `staleTime: 5_000` and no `refetchInterval`: the list changes only through this admin's own actions, which invalidate it. Deviation from the CLAUDE.md query default, recorded here.
4. **400 vs 500.** Use-case validation throws `MediaValidationError`; the route maps it and `ZodError` to 400, `/not found/i` to 404, everything else to 500 with a fixed body and the real error logged. The CLAUDE.md pattern (everything else → 400) would report a Storage outage as the admin's mistake.

## Review Focus

1. Two uploads of the same file in the same millisecond get different paths (random suffix) — Task 2 test `gives two uploads of the same file different paths`.
2. A `quizId` with path characters (`../x`, `a/b`) never reaches the path — Task 1 schema test and Task 4 route test `rejects a quizId with path characters`.
3. An empty file (size 0) is rejected, not stored as a 0-byte object — Task 2 test `rejects an empty file`.
4. A 413 from Vercel arrives as HTML, not JSON; the hook still shows the size message — Task 5 test `maps a non-JSON 413 to the size message`.
5. A file with no declared type (`''`) is rejected as the wrong type — Task 2 test `rejects a file with no content type`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/application/ports/storage-service.ts` | `IStorageService` port and its value types | 1 |
| `src/application/dtos/media.dto.ts` | media DTOs, input schemas, shared limits and copy | 1 |
| `src/application/use-cases/media-validation-error.ts` | `MediaValidationError` | 1 |
| `src/lib/image-utils.ts` | type list from the DTO module; `isWithinUploadLimit` | 1 |
| `src/application/use-cases/{upload,list,delete}-media.use-case.ts` | the three use cases | 2 |
| `src/infrastructure/storage/supabase-storage-service.ts` | service-role adapter | 3 |
| `src/application/services/factories.ts` | `mediaService` | 4 |
| `src/app/api/admin/media/route.ts` | POST / GET / DELETE | 4 |
| `src/hooks/use-media.ts` | fetchers, key factory, `useMediaLibrary`, `useUploadMedia` | 5 |
| `src/components/admin/{media-library,create-question-dialog,edit-question-dialog,image-upload}.tsx` | use the hooks; after-resize check | 6 |
| `e2e/admin-media.spec.ts` | upload through the dialog; API round trip; 401 | 7 |
| `src/infrastructure/database/prisma/migrations/20261016000000_restrict_quiz_media_writes/migration.sql` | drop the two write policies | 8 |

---

### Task 1: Port, DTOs, shared limits — `implementer-transcribe`

**Files:**
- Create: `src/application/ports/storage-service.ts`, `src/application/use-cases/media-validation-error.ts`
- Modify: `src/application/dtos/media.dto.ts`, `src/lib/image-utils.ts:119-122`, `docs/DECISION-LOG.md` (ADR-025 before "## Open ideas"), `CLAUDE.md` (layer section)
- Test: `src/tests/application/dtos/media-dto.test.ts`, `src/tests/lib/image-utils.test.ts`

**Interfaces:**
- Produces: everything below, used by Tasks 2–6.

- [ ] **Step 1: Write the failing tests**

`src/tests/application/dtos/media-dto.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  UploadMediaInputSchema,
  DeleteMediaInputSchema,
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
} from '@application/dtos/media.dto';

describe('media DTOs', () => {
  it('pins the allowed types and the 4 MB limit', () => {
    expect(MEDIA_ALLOWED_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    expect(MEDIA_MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
  });

  it('accepts a plain quiz ID', () => {
    expect(UploadMediaInputSchema.parse({ quizId: 'cm1abc_X-9' })).toEqual({ quizId: 'cm1abc_X-9' });
  });

  it.each(['', '../x', 'a/b', 'a b'])('rejects quizId %j', (quizId) => {
    const result = UploadMediaInputSchema.safeParse({ quizId });
    expect(result.success).toBe(false);
  });

  it('rejects an empty delete path', () => {
    expect(DeleteMediaInputSchema.safeParse({ path: '' }).success).toBe(false);
  });
});
```

`src/tests/lib/image-utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isValidImageType, isWithinUploadLimit } from '@lib/image-utils';
import { MEDIA_MAX_UPLOAD_BYTES } from '@application/dtos/media.dto';

const fileOf = (size: number, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], 'photo.png', { type });

describe('image-utils', () => {
  it('accepts the four image types and nothing else', () => {
    expect(isValidImageType(fileOf(1, 'image/gif'))).toBe(true);
    expect(isValidImageType(fileOf(1, 'image/svg+xml'))).toBe(false);
  });

  it('accepts a file at the upload limit', () => {
    expect(isWithinUploadLimit(fileOf(MEDIA_MAX_UPLOAD_BYTES))).toBe(true);
  });

  it('rejects a file one byte over the upload limit', () => {
    expect(isWithinUploadLimit(fileOf(MEDIA_MAX_UPLOAD_BYTES + 1))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test:run src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts`
Expected: FAIL — `UploadMediaInputSchema` / `isWithinUploadLimit` not exported.

- [ ] **Step 3: Write the code**

`src/application/ports/storage-service.ts`:
```ts
/**
 * Port for the media store. Implemented in infrastructure; the bucket is
 * fixed by the implementation.
 */
export type StoredObject = { path: string; url: string };

export type StorageListEntry = {
  name: string;
  path: string;
  size: number;
  createdAt: string;
};

export interface IStorageService {
  upload(input: { path: string; body: ArrayBuffer; contentType: string }): Promise<StoredObject>;
  delete(path: string): Promise<void>;
  list(prefix?: string): Promise<StorageListEntry[]>;
  getPublicUrl(path: string): string;
}
```

`src/application/use-cases/media-validation-error.ts`:
```ts
/** A media request the admin can fix; the API maps it to 400. */
export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}
```

Append to `src/application/dtos/media.dto.ts` (keep `MediaFileDTOSchema`):
```ts
export const MEDIA_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type MediaContentType = (typeof MEDIA_ALLOWED_TYPES)[number];
export const MEDIA_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MEDIA_TOO_LARGE_MESSAGE = 'Image must be 4 MB or smaller';

export const UploadMediaInputSchema = z.object({
  quizId: z.string().regex(/^[A-Za-z0-9_-]+$/, 'Invalid quiz ID'),
});
export type UploadMediaInputDTO = z.infer<typeof UploadMediaInputSchema>;

export const UploadMediaResultDTOSchema = z.object({
  url: z.string().url(),
  path: z.string(),
});
export type UploadMediaResultDTO = z.infer<typeof UploadMediaResultDTOSchema>;

export const DeleteMediaInputSchema = z.object({
  path: z.string().min(1, 'Invalid media path'),
});
export type DeleteMediaInputDTO = z.infer<typeof DeleteMediaInputSchema>;
```

`src/lib/image-utils.ts`: `isValidImageType` becomes
`(MEDIA_ALLOWED_TYPES as readonly string[]).includes(file.type)`, importing `MEDIA_ALLOWED_TYPES`
and `MEDIA_MAX_UPLOAD_BYTES` from `@application/dtos/media.dto`; add
```ts
/** Whether a (resized) image fits the server's upload limit. */
export const isWithinUploadLimit = (file: Blob): boolean => file.size <= MEDIA_MAX_UPLOAD_BYTES;
```

`docs/DECISION-LOG.md`, new section before `## Open ideas (not decisions)` (after ADR-024's `---`):
```markdown
## ADR-025: Outside-Service Interfaces Live in `src/application/ports/` (2026-10-16)

**Status**: ✅ **ACTIVE**
**Date**: 2026-10-16

### Decision
Interfaces for outside services that infrastructure implements (storage now; the realtime
transport and presence tracker next) live in `src/application/ports/`. Repository interfaces stay
in `src/domain/repositories/`.

### Rationale
- User ruling (2026-10-16, admin media API design): storage and realtime transports are not
  domain concepts, and the application layer is where use cases need them.
- `IStorageService` sat in `src/infrastructure/storage/`, where use cases may not import it.

### Rejected
- `src/domain/services/`: one home for every implemented interface, but domain would hold files,
  buckets and presence channels.

### References
- [progress/plans/2026-10-15-admin-media-api-design.md](progress/plans/2026-10-15-admin-media-api-design.md)

---
```

`CLAUDE.md`, in "Architecture and layer rules", after the Application bullet:
`- Ports (`src/application/ports/**`): interfaces for outside services that infrastructure implements (ADR-025); repository interfaces stay in `src/domain/repositories/`.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test:run src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts`
Expected: PASS, 2 files, 10 tests.

- [ ] **Step 5: Type-check and lint**

Run: `yarn tsc --noEmit && yarn eslint src/application/ports src/application/dtos/media.dto.ts src/application/use-cases/media-validation-error.ts src/lib/image-utils.ts src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts`
Expected: exit 0, no output from eslint.

- [ ] **Step 6: Commit**

```bash
git add src/application/ports src/application/dtos/media.dto.ts src/application/use-cases/media-validation-error.ts src/lib/image-utils.ts src/tests/application/dtos/media-dto.test.ts src/tests/lib/image-utils.test.ts docs/DECISION-LOG.md CLAUDE.md
git commit -m "feat(media): add storage port and media DTOs"
```

---

### Task 2: Use cases — `implementer`

**Files:**
- Create: `src/application/use-cases/upload-media.use-case.ts`, `list-media.use-case.ts`, `delete-media.use-case.ts`
- Test: `src/tests/application/use-cases/media-use-cases.test.ts`

**Interfaces:**
- Consumes: Task 1's `IStorageService`, `MediaValidationError`, `MEDIA_*`, `MediaFileDTO`, `UploadMediaResultDTO`, `DeleteMediaInputDTO`.
- Produces:
  - `export type UploadMediaInput = { quizId: string; file: { bytes: ArrayBuffer; contentType: string; size: number } };`
  - `class UploadMediaUseCase { constructor(storage: IStorageService); execute(input: UploadMediaInput): Promise<UploadMediaResultDTO> }`
  - `class ListMediaUseCase { constructor(storage: IStorageService); execute(): Promise<MediaFileDTO[]> }`
  - `class DeleteMediaUseCase { constructor(storage: IStorageService); execute(input: DeleteMediaInputDTO): Promise<void> }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IStorageService } from '@application/ports/storage-service';
import { UploadMediaUseCase } from '@application/use-cases/upload-media.use-case';
import { ListMediaUseCase } from '@application/use-cases/list-media.use-case';
import { DeleteMediaUseCase } from '@application/use-cases/delete-media.use-case';
import { MediaValidationError } from '@application/use-cases/media-validation-error';

const storage = {
  upload: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getPublicUrl: vi.fn(),
} satisfies Record<keyof IStorageService, unknown>;

const file = (contentType = 'image/jpeg', size = 1024) => ({
  bytes: new ArrayBuffer(size),
  contentType,
  size,
});

beforeEach(() => {
  vi.resetAllMocks();
  storage.upload.mockImplementation(async ({ path }: { path: string }) => ({
    path,
    url: `https://cdn.test/${path}`,
  }));
  storage.getPublicUrl.mockImplementation((path: string) => `https://cdn.test/${path}`);
});

afterEach(() => {
  vi.restoreAllMocks(); // undoes the Date.now spy
});

describe('UploadMediaUseCase', () => {
  const useCase = () => new UploadMediaUseCase(storage);

  it('uploads under questions/<quizId>/ and returns url and path', async () => {
    const result = await useCase().execute({ quizId: 'quiz-1', file: file() });
    expect(result.path).toMatch(/^questions\/quiz-1\/\d+-[a-z0-9]+\.jpg$/);
    expect(result.url).toBe(`https://cdn.test/${result.path}`);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg', path: result.path })
    );
  });

  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ])('names a %s file .%s', async (contentType, ext) => {
    const { path } = await useCase().execute({ quizId: 'quiz-1', file: file(contentType) });
    expect(path.endsWith(`.${ext}`)).toBe(true);
  });

  it('gives two uploads of the same file different paths', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const a = await useCase().execute({ quizId: 'quiz-1', file: file() });
    const b = await useCase().execute({ quizId: 'quiz-1', file: file() });
    expect(a.path).not.toBe(b.path);
  });

  it.each(['image/svg+xml', 'text/plain'])('rejects type %s', async (contentType) => {
    await expect(useCase().execute({ quizId: 'quiz-1', file: file(contentType) }))
      .rejects.toThrow(new MediaValidationError('Image must be a JPEG, PNG, WebP or GIF'));
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects a file with no content type', async () => {
    await expect(useCase().execute({ quizId: 'quiz-1', file: file('') }))
      .rejects.toThrow('Image must be a JPEG, PNG, WebP or GIF');
  });

  it('rejects a file over 4 MB', async () => {
    await expect(
      useCase().execute({ quizId: 'quiz-1', file: file('image/jpeg', 4 * 1024 * 1024 + 1) })
    ).rejects.toThrow('Image must be 4 MB or smaller');
  });

  it('accepts a file of exactly 4 MB', async () => {
    await expect(
      useCase().execute({ quizId: 'quiz-1', file: file('image/jpeg', 4 * 1024 * 1024) })
    ).resolves.toBeDefined();
  });

  it('rejects an empty file', async () => {
    await expect(useCase().execute({ quizId: 'quiz-1', file: file('image/jpeg', 0) }))
      .rejects.toThrow('Image is empty');
  });

  it('rejects a quizId with path characters', async () => {
    await expect(useCase().execute({ quizId: '../x', file: file() }))
      .rejects.toThrow('Invalid quiz ID');
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('ListMediaUseCase', () => {
  it('maps entries to MediaFileDTO with public URLs', async () => {
    storage.list.mockResolvedValue([
      { name: 'a.jpg', path: 'a.jpg', size: 10, createdAt: '2026-10-16T00:00:00Z' },
    ]);
    await expect(new ListMediaUseCase(storage).execute()).resolves.toEqual([
      { name: 'a.jpg', path: 'a.jpg', url: 'https://cdn.test/a.jpg', size: 10, createdAt: '2026-10-16T00:00:00Z' },
    ]);
  });

  it('returns an empty list for an empty bucket', async () => {
    storage.list.mockResolvedValue([]);
    await expect(new ListMediaUseCase(storage).execute()).resolves.toEqual([]);
  });
});

describe('DeleteMediaUseCase', () => {
  const useCase = () => new DeleteMediaUseCase(storage);

  it('deletes the path', async () => {
    await useCase().execute({ path: 'questions/quiz-1/1-a.jpg' });
    expect(storage.delete).toHaveBeenCalledWith('questions/quiz-1/1-a.jpg');
  });

  it.each(['', '/questions/a.jpg', 'questions/../secret.jpg', '..'])(
    'rejects path %j',
    async (path) => {
      await expect(useCase().execute({ path })).rejects.toThrow(
        new MediaValidationError('Invalid media path')
      );
      expect(storage.delete).not.toHaveBeenCalled();
    }
  );

  it('passes the port not-found message through', async () => {
    storage.delete.mockRejectedValue(new Error('Media file a.jpg not found'));
    await expect(useCase().execute({ path: 'a.jpg' })).rejects.toThrow('Media file a.jpg not found');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test:run src/tests/application/use-cases/media-use-cases.test.ts`
Expected: FAIL — the use-case modules do not exist.

- [ ] **Step 3: Implement the three use cases** with the Interfaces signatures. Upload validates in this order: quizId (`UploadMediaInputSchema`, rethrown as `MediaValidationError('Invalid quiz ID')`), type, empty, size; then builds the path with `Date.now()` and a random base-36 suffix of 6+ characters. All validation failures throw `MediaValidationError` with the Global Constraints copy. Delete validates with `DeleteMediaInputSchema` plus `startsWith('/')` and `includes('..')`, all as `MediaValidationError('Invalid media path')`.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test:run src/tests/application/use-cases/media-use-cases.test.ts`
Expected: PASS, 1 file, 20 tests.

- [ ] **Step 5: Type-check and lint**

Run: `yarn tsc --noEmit && yarn eslint src/application/use-cases/*-media.use-case.ts src/tests/application/use-cases/media-use-cases.test.ts`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/application/use-cases/*-media.use-case.ts src/tests/application/use-cases/media-use-cases.test.ts
git commit -m "feat(media): add upload, list and delete use cases"
```

---

### Task 3: Service-role storage adapter — `implementer`

**Files:**
- Create: `src/infrastructure/storage/supabase-storage-service.ts`
- Test: `src/tests/infrastructure/storage/supabase-storage-service.test.ts`
- Read, do not change: `src/infrastructure/realtime/supabase-server-client.ts` (capable-tier), `src/infrastructure/storage/supabase-storage.ts` (the old browser adapter's `list` mapping and placeholder filter)

**Interfaces:**
- Consumes: `IStorageService`, `StoredObject`, `StorageListEntry` (Task 1); `getSupabaseServerClient(): SupabaseClient | null`.
- Produces: `export class SupabaseStorageService implements IStorageService` with a no-argument constructor; bucket `quiz-media`.

- [ ] **Step 1: Write the failing test.** Mock the server client module and assert:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const bucket = {
    upload: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    getPublicUrl: vi.fn(),
  };
  return { bucket, from: vi.fn(() => bucket), getClient: vi.fn() };
});

vi.mock('@infrastructure/realtime/supabase-server-client', () => ({
  getSupabaseServerClient: mocks.getClient,
}));

import { SupabaseStorageService } from '@infrastructure/storage/supabase-storage-service';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue(mocks.bucket);
  mocks.getClient.mockReturnValue({ storage: { from: mocks.from } });
  mocks.bucket.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://cdn.test/${path}` },
  }));
});

describe('SupabaseStorageService', () => {
  it('uploads to quiz-media without upsert and returns path and public URL', async () => {
    mocks.bucket.upload.mockResolvedValue({ data: { path: 'questions/q/1-a.jpg' }, error: null });
    const body = new ArrayBuffer(3);
    const result = await new SupabaseStorageService().upload({
      path: 'questions/q/1-a.jpg', body, contentType: 'image/jpeg',
    });
    expect(mocks.from).toHaveBeenCalledWith('quiz-media');
    expect(mocks.bucket.upload).toHaveBeenCalledWith('questions/q/1-a.jpg', body, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
    });
    expect(result).toEqual({ path: 'questions/q/1-a.jpg', url: 'https://cdn.test/questions/q/1-a.jpg' });
  });

  it('passes a Supabase upload error through', async () => {
    mocks.bucket.upload.mockResolvedValue({ data: null, error: new Error('The resource already exists') });
    await expect(new SupabaseStorageService().upload({
      path: 'p.jpg', body: new ArrayBuffer(1), contentType: 'image/jpeg',
    })).rejects.toThrow('The resource already exists');
  });

  it('throws "Media file <path> not found" when remove deletes nothing', async () => {
    mocks.bucket.remove.mockResolvedValue({ data: [], error: null });
    await expect(new SupabaseStorageService().delete('gone.jpg')).rejects.toThrow('Media file gone.jpg not found');
  });

  it('deletes an existing object', async () => {
    mocks.bucket.remove.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null });
    await expect(new SupabaseStorageService().delete('a.jpg')).resolves.toBeUndefined();
    expect(mocks.bucket.remove).toHaveBeenCalledWith(['a.jpg']);
  });

  it('lists entries without the folder placeholder', async () => {
    mocks.bucket.list.mockResolvedValue({
      data: [
        { name: '.emptyFolderPlaceholder', metadata: { size: 0 }, created_at: '2026-01-01T00:00:00Z' },
        { name: 'a.jpg', metadata: { size: 10 }, created_at: '2026-10-16T00:00:00Z' },
      ],
      error: null,
    });
    await expect(new SupabaseStorageService().list()).resolves.toEqual([
      { name: 'a.jpg', path: 'a.jpg', size: 10, createdAt: '2026-10-16T00:00:00Z' },
    ]);
  });

  it.each(['upload', 'delete', 'list'] as const)(
    '%s throws "Storage is not configured" without a service-role client',
    async (method) => {
      mocks.getClient.mockReturnValue(null);
      const service = new SupabaseStorageService();
      const call = {
        upload: () => service.upload({ path: 'p', body: new ArrayBuffer(1), contentType: 'image/jpeg' }),
        delete: () => service.delete('p'),
        list: () => service.list(),
      }[method];
      await expect(call()).rejects.toThrow('Storage is not configured');
    }
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test:run src/tests/infrastructure/storage/supabase-storage-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SupabaseStorageService`.** Resolve the client per call (so a missing key fails the call, not the import); `list(prefix?)` uses `list(prefix ?? '', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })` and builds `path` as `prefix ? \`${prefix}/${name}\` : name`; `getPublicUrl` needs no client call beyond `storage.from(...).getPublicUrl` and also throws `Storage is not configured` without a client.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test:run src/tests/infrastructure/storage/supabase-storage-service.test.ts`
Expected: PASS, 1 file, 8 tests.

- [ ] **Step 5: Type-check and lint**

Run: `yarn tsc --noEmit && yarn eslint src/infrastructure/storage/supabase-storage-service.ts src/tests/infrastructure/storage/supabase-storage-service.test.ts`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/storage/supabase-storage-service.ts src/tests/infrastructure/storage/supabase-storage-service.test.ts
git commit -m "feat(media): add service-role storage adapter"
```

---

### Task 4: Service wiring and routes — `implementer`

**Files:**
- Modify: `src/application/services/factories.ts` (type `MediaService`, `ServiceContainer.mediaService`, wiring next to `questionService`), `src/tests/app/api/quiz-routes.test.ts:36-47` (add `mediaService: {} as ServiceContainer['mediaService']`)
- Create: `src/app/api/admin/media/route.ts`
- Test: `src/tests/app/api/media-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `type MediaService = { upload(input: UploadMediaInput): Promise<UploadMediaResultDTO>; list(): Promise<MediaFileDTO[]>; delete(input: DeleteMediaInputDTO): Promise<void> }`, built from the three use cases on one `new SupabaseStorageService()`.
  - `POST /api/admin/media` (multipart: `file`, `quizId`) → 201 `UploadMediaResultDTO`; `GET` → 200 `MediaFileDTO[]`; `DELETE` (JSON `{ path }`) → 204. Errors as in correction 4.

- [ ] **Step 1: Write the failing tests** (same mocking as `quiz-routes.test.ts`: `vi.mock` the Prisma client, `vi.spyOn(servicesModule, 'getServices')` returning a container whose `mediaService` has `upload`, `list`, `delete` as `vi.fn()`):

```ts
const post = (form: FormData) =>
  POST(new Request('http://localhost/api/admin/media', { method: 'POST', body: form }));
const del = (body: unknown) =>
  DELETE(new Request('http://localhost/api/admin/media', {
    method: 'DELETE', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
const imageForm = (quizId = 'quiz-1') => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/jpeg' }));
  form.set('quizId', quizId);
  return form;
};

it('POST uploads and returns 201 with url and path', async () => {
  mediaService.upload.mockResolvedValue({ url: 'https://cdn.test/p.jpg', path: 'p.jpg' });
  const res = await post(imageForm());
  expect(res.status).toBe(201);
  await expect(res.json()).resolves.toEqual({ url: 'https://cdn.test/p.jpg', path: 'p.jpg' });
  const [input] = mediaService.upload.mock.calls[0];
  expect(input.quizId).toBe('quiz-1');
  expect(input.file).toMatchObject({ contentType: 'image/jpeg', size: 3 });
  expect(input.file.bytes.byteLength).toBe(3);
});

it('POST without a file returns 400 "No image file provided"', async () => {
  const form = new FormData();
  form.set('quizId', 'quiz-1');
  const res = await post(form);
  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: 'No image file provided' });
  expect(mediaService.upload).not.toHaveBeenCalled();
});

it('rejects a quizId with path characters', async () => {
  const res = await post(imageForm('../x'));
  expect(res.status).toBe(400);
  expect(mediaService.upload).not.toHaveBeenCalled();
});

it('POST maps MediaValidationError to 400 with its message', async () => {
  mediaService.upload.mockRejectedValue(new MediaValidationError('Image must be 4 MB or smaller'));
  const res = await post(imageForm());
  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: 'Image must be 4 MB or smaller' });
});

it('POST maps an unexpected error to 500 "Unable to upload image"', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mediaService.upload.mockRejectedValue(new Error('Storage is not configured'));
  const res = await post(imageForm());
  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toEqual({ error: 'Unable to upload image' });
});

it('GET returns the media list', async () => {
  mediaService.list.mockResolvedValue([]);
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual([]);
});

it('GET maps an unexpected error to 500 "Unable to load media"', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mediaService.list.mockRejectedValue(new Error('boom'));
  const res = await GET();
  expect(res.status).toBe(500);
  await expect(res.json()).resolves.toEqual({ error: 'Unable to load media' });
});

it('DELETE returns 204', async () => {
  mediaService.delete.mockResolvedValue(undefined);
  const res = await del({ path: 'a.jpg' });
  expect(res.status).toBe(204);
  expect(mediaService.delete).toHaveBeenCalledWith({ path: 'a.jpg' });
});

it('DELETE maps "not found" to 404', async () => {
  mediaService.delete.mockRejectedValue(new Error('Media file a.jpg not found'));
  const res = await del({ path: 'a.jpg' });
  expect(res.status).toBe(404);
  await expect(res.json()).resolves.toEqual({ error: 'Media file a.jpg not found' });
});

it('DELETE with an empty path returns 400', async () => {
  const res = await del({ path: '' });
  expect(res.status).toBe(400);
  expect(mediaService.delete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test:run src/tests/app/api/media-routes.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement** `MediaService` in `factories.ts` and the route. The route parses `quizId` with `UploadMediaInputSchema` and `DELETE` bodies with `DeleteMediaInputSchema`; a `ZodError` answers 400 with its first issue's message. One error-mapping helper per file (400 for `MediaValidationError`/`ZodError`, 404 for `/not found/i`, else `console.error` and 500 with the method's fixed body).

- [ ] **Step 4: Run to verify it passes, and the existing route test still passes**

Run: `yarn test:run src/tests/app/api/`
Expected: PASS, 2 files (`media-routes` 10 tests plus `quiz-routes` unchanged).

- [ ] **Step 5: Type-check, lint, full suite**

Run: `yarn tsc --noEmit && yarn eslint src/application/services/factories.ts src/app/api/admin/media src/tests/app/api && yarn test:run`
Expected: exit 0; 71 files passed / 1 skipped; 489 + 10 (Task 1) + 20 (Task 2) + 8 (Task 3) + 10 = 537 tests passed / 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/application/services/factories.ts src/app/api/admin/media src/tests/app/api
git commit -m "feat(media): add admin media API routes"
```

---

### Task 5: Media hooks — `implementer`

**Files:**
- Create: `src/hooks/use-media.ts`
- Test: `src/tests/hooks/use-media.test.ts`

**Interfaces:**
- Consumes: `MediaFileDTO`, `UploadMediaResultDTO`, `MEDIA_TOO_LARGE_MESSAGE` (Task 1); the routes (Task 4).
- Produces:
  - `export const mediaQueryKey = () => ['admin', 'media'] as const;`
  - `export const fetchMediaFiles = (): Promise<MediaFileDTO[]>`
  - `export const uploadMediaFile = (file: File, quizId: string): Promise<UploadMediaResultDTO>`
  - `export const deleteMediaFile = (path: string): Promise<void>`
  - `export function useMediaLibrary(): UseQueryResult<MediaFileDTO[]> & { deleteFile: UseMutationResult<void, Error, string> }`
  - `export function useUploadMedia(quizId: string): UseMutationResult<UploadMediaResultDTO, Error, File>`

- [ ] **Step 1: Write the failing tests** (no jsdom: test the key and the fetchers with `vi.stubGlobal('fetch', vi.fn())`, `vi.unstubAllGlobals()` in `afterEach`):

```ts
const respond = (status: number, body?: unknown, raw?: string) =>
  new Response(raw ?? (body === undefined ? null : JSON.stringify(body)), { status });

it('builds the admin media key', () => {
  expect(mediaQueryKey()).toEqual(['admin', 'media']);
});

it('uploads multipart with file and quizId', async () => {
  fetchMock.mockResolvedValue(respond(201, { url: 'https://cdn.test/a.jpg', path: 'a.jpg' }));
  const file = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' });
  await expect(uploadMediaFile(file, 'quiz-1')).resolves.toEqual({ url: 'https://cdn.test/a.jpg', path: 'a.jpg' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/admin/media');
  expect(init.method).toBe('POST');
  expect((init.body as FormData).get('quizId')).toBe('quiz-1');
  expect((init.body as FormData).get('file')).toBeInstanceOf(File);
});

it('maps a non-JSON 413 to the size message', async () => {
  fetchMock.mockResolvedValue(respond(413, undefined, '<html>Request Entity Too Large</html>'));
  await expect(uploadMediaFile(new File([], 'a.jpg'), 'quiz-1')).rejects.toThrow('Image must be 4 MB or smaller');
});

it('surfaces the server error message', async () => {
  fetchMock.mockResolvedValue(respond(400, { error: 'Image must be a JPEG, PNG, WebP or GIF' }));
  await expect(uploadMediaFile(new File([], 'a.jpg'), 'quiz-1')).rejects.toThrow('Image must be a JPEG, PNG, WebP or GIF');
});

it('falls back to "Unable to upload image" without a server message', async () => {
  fetchMock.mockResolvedValue(respond(500, undefined, 'oops'));
  await expect(uploadMediaFile(new File([], 'a.jpg'), 'quiz-1')).rejects.toThrow('Unable to upload image');
});

it('lists media', async () => {
  fetchMock.mockResolvedValue(respond(200, []));
  await expect(fetchMediaFiles()).resolves.toEqual([]);
  expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/media');
});

it('falls back to "Unable to load media"', async () => {
  fetchMock.mockResolvedValue(respond(500, undefined, 'oops'));
  await expect(fetchMediaFiles()).rejects.toThrow('Unable to load media');
});

it('deletes by path with a JSON body', async () => {
  fetchMock.mockResolvedValue(respond(204));
  await expect(deleteMediaFile('a.jpg')).resolves.toBeUndefined();
  const [, init] = fetchMock.mock.calls[0];
  expect(init.method).toBe('DELETE');
  expect(JSON.parse(init.body as string)).toEqual({ path: 'a.jpg' });
});

it('surfaces a delete 404 message', async () => {
  fetchMock.mockResolvedValue(respond(404, { error: 'Media file a.jpg not found' }));
  await expect(deleteMediaFile('a.jpg')).rejects.toThrow('Media file a.jpg not found');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test:run src/tests/hooks/use-media.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/use-media.ts`** (`'use client'`), following `use-host-quiz-players.ts`: fetchers use `cache: 'no-store'` and the CLAUDE.md error parsing; `uploadMediaFile` checks `response.status === 413` before parsing. `useMediaLibrary` uses `staleTime: 5_000` and no `refetchInterval` (correction 3); its delete mutation invalidates `mediaQueryKey()` on success.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn test:run src/tests/hooks/use-media.test.ts`
Expected: PASS, 1 file, 9 tests.

- [ ] **Step 5: Type-check and lint**

Run: `yarn tsc --noEmit && yarn eslint src/hooks/use-media.ts src/tests/hooks/use-media.test.ts`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-media.ts src/tests/hooks/use-media.test.ts
git commit -m "feat(media): add admin media hooks"
```

---

### Task 6: Components switch, old client removed — `implementer`

Before dispatch, the controller copies `.env.local` into the worktree (git-ignored; `yarn build`
and the browser check need it) and starts the dev server from the worktree.

**Files:**
- Modify: `src/components/admin/media-library.tsx`, `create-question-dialog.tsx` (lines ~27, 46, 293-304), `edit-question-dialog.tsx` (lines ~27, 57, 320-331), `image-upload.tsx` (after the resize at ~line 92)
- Delete: `src/infrastructure/storage/supabase-storage.ts`, `src/infrastructure/storage/storage-service.ts`
- Modify: `docs/ARCHITECTURE.md:227-230` (storage bullets: port in `src/application/ports/`, service-role adapter, uploads through `/api/admin/media`)

**Interfaces:**
- Consumes: Task 5's hooks; Task 1's `isWithinUploadLimit`.

- [ ] **Step 1: Switch the components.**
  - `media-library.tsx`: `useMediaLibrary()` replaces the inline query and `handleDelete`'s storage call (`deleteFile.mutateAsync(file.path)` after the existing `confirm()`); a failed delete shows `deleteFile.error.message` near the list.
  - Both dialogs: `const uploadMedia = useUploadMedia(quizId);` and `onUpload={async (file) => { const { url } = await uploadMedia.mutateAsync(file); setMediaUrl(url); return url; }}`. Thrown errors already reach `ImageUpload`'s `setError`.
  - `image-upload.tsx`: after `resizeImage`, `if (!isWithinUploadLimit(resizedFile)) { setError('Image must be 4 MB or smaller after resizing'); return; }` (inside the `try`, so `finally` clears the spinner).
  - Delete the two old storage files.

- [ ] **Step 2: Prove nothing imports the old client and no touched component imports infrastructure**

Run: `command grep -rn "createStorageService\|storage/storage-service\|storage/supabase-storage'" src e2e; command grep -n "@infrastructure/" src/components/admin/{media-library,create-question-dialog,edit-question-dialog,image-upload}.tsx`
Expected: no output, exit 1 for both.

- [ ] **Step 3: Type-check, lint, full suite, build**

Run: `yarn tsc --noEmit && yarn eslint src/components/admin && yarn test:run && yarn build`
Expected: exit 0; 72 files passed / 1 skipped; 546 tests passed / 1 skipped; build completes.

- [ ] **Step 4: Verify in the browser (CLAUDE.md working rule).** With the dev server running from this worktree (`.env.local` copied in by the controller), sign in as the test admin, open a quiz, add a question with a small PNG through the dialog; the preview shows the image and its URL contains `/quiz-media/questions/<quizId>/` and ends `.jpg`. Open `/admin/media`; the page loads without errors. Record both in the report.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/admin src/infrastructure/storage docs/ARCHITECTURE.md
git commit -m "feat(media): upload and manage media through the API"
```

---

### Task 7: E2E — `implementer`

**Files:**
- Create: `e2e/admin-media.spec.ts`

**Interfaces:**
- Consumes: the routes (Task 4), the dialog (Task 6), `AdminQuizDetailPage` (`e2e/pages`), the admin `storageState`.

- [ ] **Step 1: Write the spec** with a 64×64 PNG built in the file as a base64 constant, three tests:
  1. `uploads an image through the create-question dialog`: create a quiz through `POST /api/admin/quizzes` (as `admin-question-crud.spec.ts` does), open its detail page, open the create-question dialog, answer the file chooser (`page.waitForEvent('filechooser')` around the upload area's click) with the PNG; expect the preview `img` `src` to match `/\/quiz-media\/questions\/<quizId>\/\d+-[a-z0-9]+\.jpg$/`. Cleanup: `DELETE /api/admin/media` with the path cut from that URL, expect 204.
  2. `round-trips an upload through the API`: `request.post('/api/admin/media', { multipart: { quizId, file: { name: 'a.png', mimeType: 'image/png', buffer } } })` → 201 with `path` ending `.png`; `request.get(url)` → 200; `DELETE` → 204; `DELETE` again → 404.
  3. `rejects an anonymous upload`: a new context with `storageState: { cookies: [], origins: [] }` posting the same multipart → 401.

- [ ] **Step 2: Run it** (dev server already running; the controller runs it)

Run: `yarn test:e2e e2e/admin-media.spec.ts`
Expected: 3 passed (plus the setup project), 0 failed.

- [ ] **Step 3: Lint and commit**

```bash
yarn eslint e2e/admin-media.spec.ts
git add e2e/admin-media.spec.ts
git commit -m "test(e2e): cover admin media upload and delete"
```

---

### Task 8: Policy migration and docs — `implementer`

**Files:**
- Create: `src/infrastructure/database/prisma/migrations/20261016000000_restrict_quiz_media_writes/migration.sql`
- Modify: `docs/guides/MEDIA-UPLOADS.md` (rewrite to the real flow; closes #80), `docs/progress/findings/2026-10-15-storage-policies-any-user.md` (dated note: fix written, pending rollout), `.claude/skills/architecture-check/SKILL.md` (the Assumed bullet on presentation infrastructure imports: the three admin storage components are gone; the realtime ones remain)

- [ ] **Step 1: Write the migration**, exactly:

```sql
-- Writes to quiz-media go through the server's service-role key only (admin media API).
DROP POLICY IF EXISTS "Authenticated users can upload quiz media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete quiz media" ON storage.objects;
```

- [ ] **Step 2: Rewrite `MEDIA-UPLOADS.md`**: bucket settings (unchanged), policies (public read only; writes via service role), the upload flow (pick → 10 MB and type check → resize to JPEG ≤1920×1080 → 4 MB check → `POST /api/admin/media` → `UploadMediaUseCase` → `SupabaseStorageService`), list and delete, the error table from the spec's section 2, the migration and its manual fallback (the same SQL in each project's SQL editor), and remove the nonexistent `src/app/api/admin/upload/route.ts`, `e2e/admin-media-upload.spec.ts` and the old `IStorageService` sample.

- [ ] **Step 3: Check the schema did not change**

Run: `git diff --stat origin/master -- src/infrastructure/database/prisma/schema.prisma`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/database/prisma/migrations/20261016000000_restrict_quiz_media_writes docs/guides/MEDIA-UPLOADS.md docs/progress/findings/2026-10-15-storage-policies-any-user.md .claude/skills/architecture-check/SKILL.md
git commit -m "feat(media): drop quiz-media write policies"
```

---

### Task 9: Real-target checks before the PR — main session

Not an agent task: it needs the dev server, the dev project and judgment on what is observed.

- [ ] **Step 1: Large photo.** Through the running app, upload a large phone-sized photo (several MB, 4000×3000 or larger). Record the original size, the resized size (the `Resized image from … to …` console line) and the POST's request size from the network log. Expected: the request is far below 4.5 MB.
- [ ] **Step 2: Public read.** An existing public image URL in `quiz-media` loads (200).
- [ ] **Step 3: Write the findings record** `docs/progress/findings/2026-10-16-admin-media-api.md` with steps 1–2 and the commands; commit it with the ledger.

## Rollout (main session, after merge — spec section 3)

1. Dev: `npx prisma migrate deploy --schema ./src/infrastructure/database/prisma/schema.prisma` (`.env.local`; no yarn script covers `migrate deploy`). If it fails on ownership of `storage.objects`, run the migration's SQL in the dev SQL editor and record it.
2. Dev checks: a direct Storage API upload and delete with the admin's session (anon key + that session, bypassing the app) fail with an RLS error; an upload through the app still works; a public URL loads. Append to the findings record.
3. Production: the user applies the migration (`migrate deploy` or the SQL editor), then the same checks against production.
4. Follow-up commit on a new branch: remove CLAUDE.md pitfall 4, add the dated note to the storage-policies findings record, index line.
