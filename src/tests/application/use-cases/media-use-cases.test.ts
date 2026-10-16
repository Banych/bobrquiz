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
  storage.getPublicUrl.mockImplementation(
    (path: string) => `https://cdn.test/${path}`
  );
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
    const { path } = await useCase().execute({
      quizId: 'quiz-1',
      file: file(contentType),
    });
    expect(path.endsWith(`.${ext}`)).toBe(true);
  });

  it('gives two uploads of the same file different paths', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const a = await useCase().execute({ quizId: 'quiz-1', file: file() });
    const b = await useCase().execute({ quizId: 'quiz-1', file: file() });
    expect(a.path).not.toBe(b.path);
  });

  it.each(['image/svg+xml', 'text/plain'])(
    'rejects type %s',
    async (contentType) => {
      await expect(
        useCase().execute({ quizId: 'quiz-1', file: file(contentType) })
      ).rejects.toThrow(
        new MediaValidationError('Image must be a JPEG, PNG, WebP or GIF')
      );
      expect(storage.upload).not.toHaveBeenCalled();
    }
  );

  it('rejects a file with no content type', async () => {
    await expect(
      useCase().execute({ quizId: 'quiz-1', file: file('') })
    ).rejects.toThrow('Image must be a JPEG, PNG, WebP or GIF');
  });

  it('rejects a file over 4 MB', async () => {
    await expect(
      useCase().execute({
        quizId: 'quiz-1',
        file: file('image/jpeg', 4 * 1024 * 1024 + 1),
      })
    ).rejects.toThrow('Image must be 4 MB or smaller');
  });

  it('accepts a file of exactly 4 MB', async () => {
    await expect(
      useCase().execute({
        quizId: 'quiz-1',
        file: file('image/jpeg', 4 * 1024 * 1024),
      })
    ).resolves.toBeDefined();
  });

  it('rejects an empty file', async () => {
    await expect(
      useCase().execute({ quizId: 'quiz-1', file: file('image/jpeg', 0) })
    ).rejects.toThrow('Image is empty');
  });

  it('rejects a quizId with path characters', async () => {
    await expect(
      useCase().execute({ quizId: '../x', file: file() })
    ).rejects.toThrow('Invalid quiz ID');
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('ListMediaUseCase', () => {
  it('maps entries to MediaFileDTO with public URLs', async () => {
    storage.list.mockResolvedValue([
      {
        name: 'a.jpg',
        path: 'a.jpg',
        size: 10,
        createdAt: '2026-10-16T00:00:00Z',
      },
    ]);
    await expect(new ListMediaUseCase(storage).execute()).resolves.toEqual([
      {
        name: 'a.jpg',
        path: 'a.jpg',
        url: 'https://cdn.test/a.jpg',
        size: 10,
        createdAt: '2026-10-16T00:00:00Z',
      },
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
    await expect(useCase().execute({ path: 'a.jpg' })).rejects.toThrow(
      'Media file a.jpg not found'
    );
  });
});
