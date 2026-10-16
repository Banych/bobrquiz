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
    mocks.bucket.upload.mockResolvedValue({
      data: { path: 'questions/q/1-a.jpg' },
      error: null,
    });
    const body = new ArrayBuffer(3);
    const result = await new SupabaseStorageService().upload({
      path: 'questions/q/1-a.jpg',
      body,
      contentType: 'image/jpeg',
    });
    expect(mocks.from).toHaveBeenCalledWith('quiz-media');
    expect(mocks.bucket.upload).toHaveBeenCalledWith(
      'questions/q/1-a.jpg',
      body,
      {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      }
    );
    expect(result).toEqual({
      path: 'questions/q/1-a.jpg',
      url: 'https://cdn.test/questions/q/1-a.jpg',
    });
  });

  it('passes a Supabase upload error through', async () => {
    mocks.bucket.upload.mockResolvedValue({
      data: null,
      error: new Error('The resource already exists'),
    });
    await expect(
      new SupabaseStorageService().upload({
        path: 'p.jpg',
        body: new ArrayBuffer(1),
        contentType: 'image/jpeg',
      })
    ).rejects.toThrow('The resource already exists');
  });

  it('throws "Media file <path> not found" when remove deletes nothing', async () => {
    mocks.bucket.remove.mockResolvedValue({ data: [], error: null });
    await expect(
      new SupabaseStorageService().delete('gone.jpg')
    ).rejects.toThrow('Media file gone.jpg not found');
  });

  it('deletes an existing object', async () => {
    mocks.bucket.remove.mockResolvedValue({
      data: [{ name: 'a.jpg' }],
      error: null,
    });
    await expect(
      new SupabaseStorageService().delete('a.jpg')
    ).resolves.toBeUndefined();
    expect(mocks.bucket.remove).toHaveBeenCalledWith(['a.jpg']);
  });

  it('lists entries without the folder placeholder', async () => {
    mocks.bucket.list.mockResolvedValue({
      data: [
        {
          name: '.emptyFolderPlaceholder',
          metadata: { size: 0 },
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          name: 'a.jpg',
          metadata: { size: 10 },
          created_at: '2026-10-16T00:00:00Z',
        },
      ],
      error: null,
    });
    await expect(new SupabaseStorageService().list()).resolves.toEqual([
      {
        name: 'a.jpg',
        path: 'a.jpg',
        size: 10,
        createdAt: '2026-10-16T00:00:00Z',
      },
    ]);
  });

  it.each(['upload', 'delete', 'list'] as const)(
    '%s throws "Storage is not configured" without a service-role client',
    async (method) => {
      mocks.getClient.mockReturnValue(null);
      const service = new SupabaseStorageService();
      const call = {
        upload: () =>
          service.upload({
            path: 'p',
            body: new ArrayBuffer(1),
            contentType: 'image/jpeg',
          }),
        delete: () => service.delete('p'),
        list: () => service.list(),
      }[method];
      await expect(call()).rejects.toThrow('Storage is not configured');
    }
  );

  it('lists under a prefix and builds prefixed paths', async () => {
    mocks.bucket.list.mockResolvedValue({
      data: [
        {
          name: 'a.jpg',
          metadata: { size: 10 },
          created_at: '2026-10-16T00:00:00Z',
        },
      ],
      error: null,
    });
    await expect(
      new SupabaseStorageService().list('questions/q')
    ).resolves.toEqual([
      {
        name: 'a.jpg',
        path: 'questions/q/a.jpg',
        size: 10,
        createdAt: '2026-10-16T00:00:00Z',
      },
    ]);
    expect(mocks.bucket.list).toHaveBeenCalledWith(
      'questions/q',
      expect.anything()
    );
  });

  it('passes a Supabase list error through', async () => {
    mocks.bucket.list.mockResolvedValue({
      data: null,
      error: new Error('list failed'),
    });
    await expect(new SupabaseStorageService().list()).rejects.toThrow(
      'list failed'
    );
  });

  it('passes a Supabase remove error through', async () => {
    mocks.bucket.remove.mockResolvedValue({
      data: null,
      error: new Error('remove failed'),
    });
    await expect(new SupabaseStorageService().delete('a.jpg')).rejects.toThrow(
      'remove failed'
    );
  });

  it('getPublicUrl throws "Storage is not configured" without a client', () => {
    mocks.getClient.mockReturnValue(null);
    expect(() => new SupabaseStorageService().getPublicUrl('p')).toThrow(
      'Storage is not configured'
    );
  });
});
