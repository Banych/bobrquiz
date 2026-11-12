import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const bucket = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
}));
const createClient = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { SupabaseMediaStorage } from '@infrastructure/storage/supabase-media-storage';

describe('SupabaseMediaStorage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co/');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    createClient.mockReturnValue({ storage: { from: () => bucket } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails loudly, without a client, when the service-role key is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const storage = new SupabaseMediaStorage();

    await expect(
      storage.upload('questions/q/1-a.png', new Uint8Array([1]), 'image/png')
    ).rejects.toThrow('Media storage is not configured');
    await expect(storage.remove('questions/q/1-a.png')).rejects.toThrow(
      'Media storage is not configured'
    );
    await expect(storage.list('questions/q/')).rejects.toThrow(
      'Media storage is not configured'
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('builds public URLs without the key, in the shape older uploads were saved with', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    expect(new SupabaseMediaStorage().getPublicUrl('questions/q/1-a.png')).toBe(
      'https://project.supabase.co/storage/v1/object/public/quiz-media/questions/q/1-a.png'
    );
  });

  it('uploads with the service-role client, the given type and no overwrite', async () => {
    bucket.upload.mockResolvedValue({ data: { path: 'p' }, error: null });
    const bytes = new Uint8Array([1, 2]);

    await new SupabaseMediaStorage().upload(
      'questions/q/1-a.png',
      bytes,
      'image/png'
    );

    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'service-key',
      expect.any(Object)
    );
    expect(bucket.upload).toHaveBeenCalledWith('questions/q/1-a.png', bytes, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: false,
    });
  });

  it('reports whether a remove deleted anything (storage returns no error either way)', async () => {
    const storage = new SupabaseMediaStorage();

    bucket.remove.mockResolvedValueOnce({
      data: [{ name: '1-a.png' }],
      error: null,
    });
    await expect(storage.remove('questions/q/1-a.png')).resolves.toBe(true);

    bucket.remove.mockResolvedValueOnce({ data: [], error: null });
    await expect(storage.remove('questions/q/1-a.png')).resolves.toBe(false);
  });

  it('lists only files directly in the folder', async () => {
    bucket.list.mockResolvedValue({
      data: [
        { name: 'sub', id: null, created_at: null, metadata: null },
        {
          name: '.emptyFolderPlaceholder',
          id: 'x',
          created_at: 't',
          metadata: { size: 0 },
        },
        {
          name: '1-a.png',
          id: 'y',
          created_at: '2026-11-11T00:00:00Z',
          metadata: { size: 42 },
        },
      ],
      error: null,
    });

    await expect(
      new SupabaseMediaStorage().list('questions/q/')
    ).resolves.toEqual([
      { name: '1-a.png', size: 42, createdAt: '2026-11-11T00:00:00Z' },
    ]);
    expect(bucket.list).toHaveBeenCalledWith('questions/q', expect.any(Object));
  });

  it('empties a folder in as many rounds as it takes', async () => {
    const file = (name: string) => ({
      name,
      id: name,
      created_at: '2026-11-11T00:00:00Z',
      metadata: { size: 1 },
    });
    bucket.list
      .mockResolvedValueOnce({
        data: [file('1-a.png'), file('1-b.png')],
        error: null,
      })
      .mockResolvedValueOnce({ data: [file('1-c.png')], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    bucket.remove.mockResolvedValue({ data: [{}], error: null });

    await new SupabaseMediaStorage().removeFolder('questions/q/');

    expect(bucket.remove.mock.calls).toEqual([
      [['questions/q/1-a.png', 'questions/q/1-b.png']],
      [['questions/q/1-c.png']],
    ]);
  });

  it('stops with an error instead of looping when a folder will not empty', async () => {
    bucket.list.mockResolvedValue({
      data: [
        { name: '1-a.png', id: 'x', created_at: 't', metadata: { size: 1 } },
      ],
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: [], error: null });

    await expect(
      new SupabaseMediaStorage().removeFolder('questions/q/')
    ).rejects.toThrow('did not empty');
  });

  it('does not fail when another delete emptied the folder first', async () => {
    const file = {
      name: '1-a.png',
      id: 'x',
      created_at: 't',
      metadata: { size: 1 },
    };
    bucket.list
      .mockResolvedValueOnce({ data: [file], error: null })
      .mockResolvedValue({ data: [], error: null });
    bucket.remove.mockResolvedValue({ data: [], error: null });

    await expect(
      new SupabaseMediaStorage().removeFolder('questions/q/')
    ).resolves.toBeUndefined();
  });

  it('turns a storage error into a thrown error', async () => {
    bucket.list.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(
      new SupabaseMediaStorage().list('questions/q/')
    ).rejects.toThrow('Failed to list media: boom');
  });
});
