import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteQuizMedia,
  fetchOwnerMedia,
  ownerMediaQueryKey,
  uploadQuizMedia,
} from '@hooks/use-quiz-media';
import type {
  MediaUploadResultDTO,
  OwnerMediaFileDTO,
} from '@application/dtos/media.dto';

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('use-quiz-media', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keys the library under admin/media', () => {
    expect(ownerMediaQueryKey()).toEqual(['admin', 'media']);
  });

  describe('fetchOwnerMedia', () => {
    it('reads the owner list route', async () => {
      const files: OwnerMediaFileDTO[] = [
        {
          name: '1-a.png',
          path: 'questions/q1/1-a.png',
          url: 'https://example.supabase.co/storage/v1/object/public/quiz-media/questions/q1/1-a.png',
          size: 10,
          createdAt: '2026-11-12T00:00:00.000Z',
          quizId: 'q1',
          quizTitle: 'Quiz one',
        },
      ];
      fetchMock.mockResolvedValue(jsonResponse(200, files));

      await expect(fetchOwnerMedia()).resolves.toEqual(files);
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/media', {
        cache: 'no-store',
      });
    });

    it("throws the server's error", async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));
      await expect(fetchOwnerMedia()).rejects.toThrow('Unauthorized');
    });

    it('falls back to a generic message for a body without JSON', async () => {
      fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));
      await expect(fetchOwnerMedia()).rejects.toThrow('Unable to load media.');
    });
  });

  describe('uploadQuizMedia', () => {
    it('posts the file as multipart field "file" to the quiz media route', async () => {
      const result: MediaUploadResultDTO = {
        url: 'https://example.supabase.co/storage/v1/object/public/quiz-media/questions/q1/1-a.jpg',
        path: 'questions/q1/1-a.jpg',
        name: '1-a.jpg',
        size: 3,
      };
      fetchMock.mockResolvedValue(jsonResponse(201, result));
      const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cat.jpg', {
        type: 'image/jpeg',
      });

      await expect(uploadQuizMedia('q1', file)).resolves.toEqual(result);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/admin/quizzes/q1/media');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
      const sent = (init.body as FormData).get('file');
      expect(sent).toBeInstanceOf(File);
      expect((sent as File).name).toBe('cat.jpg');
    });

    it("throws the server's refusal, such as the media cap", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: 'Media limit reached: 200 files' })
      );
      const file = new File([new Uint8Array([1])], 'x.png');

      await expect(uploadQuizMedia('q1', file)).rejects.toThrow(
        'Media limit reached: 200 files'
      );
    });

    it('throws a generic message when the error body is empty', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
      const file = new File([new Uint8Array([1])], 'x.png');

      await expect(uploadQuizMedia('q1', file)).rejects.toThrow(
        'Unable to upload image.'
      );
    });
  });

  describe('deleteQuizMedia', () => {
    it('sends DELETE to the file route', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));

      await deleteQuizMedia('q1', '1-a.png');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/quizzes/q1/media/1-a.png',
        { method: 'DELETE' }
      );
    });

    it('encodes path segments so a name cannot reach another route', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));

      await deleteQuizMedia('q1', '../x.png');

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/admin/quizzes/q1/media/..%2Fx.png'
      );
    });

    it('throws on a 404', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, { error: 'Media file not found' })
      );

      await expect(deleteQuizMedia('q1', '1-a.png')).rejects.toThrow(
        'Media file not found'
      );
    });
  });
});
