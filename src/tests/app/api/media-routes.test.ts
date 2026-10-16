import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    $disconnect: vi.fn(),
  },
}));

import { POST, GET, DELETE } from '@/app/api/admin/media/route';
import * as servicesModule from '@application/services/factories';
import { MediaValidationError } from '@application/use-cases/media-validation-error';

type MockMediaService = {
  upload: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type ServiceContainer = ReturnType<typeof servicesModule.getServices>;

const post = (form: FormData) =>
  POST(
    new Request('http://localhost/api/admin/media', {
      method: 'POST',
      body: form,
    })
  );
const del = (body: unknown) =>
  DELETE(
    new Request('http://localhost/api/admin/media', {
      method: 'DELETE',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );
const imageForm = (quizId = 'quiz-1') => {
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/jpeg' })
  );
  form.set('quizId', quizId);
  return form;
};

describe('Admin media API route', () => {
  let mediaService: MockMediaService;

  beforeEach(() => {
    mediaService = {
      upload: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };

    vi.spyOn(servicesModule, 'getServices').mockReturnValue({
      quizService: {} as ServiceContainer['quizService'],
      playerService: {} as ServiceContainer['playerService'],
      answerService: {} as ServiceContainer['answerService'],
      joinSessionUseCase: {} as ServiceContainer['joinSessionUseCase'],
      questionService: {} as ServiceContainer['questionService'],
      auditService: {} as ServiceContainer['auditService'],
      mediaService: mediaService as unknown as ServiceContainer['mediaService'],
      lockQuestionUseCase: {} as ServiceContainer['lockQuestionUseCase'],
      getPlayerConnectionStatusUseCase:
        {} as ServiceContainer['getPlayerConnectionStatusUseCase'],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST uploads and returns 201 with url and path', async () => {
    mediaService.upload.mockResolvedValue({
      url: 'https://cdn.test/p.jpg',
      path: 'p.jpg',
    });
    const res = await post(imageForm());
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      url: 'https://cdn.test/p.jpg',
      path: 'p.jpg',
    });
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
    await expect(res.json()).resolves.toEqual({
      error: 'No image file provided',
    });
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('rejects a quizId with path characters', async () => {
    const res = await post(imageForm('../x'));
    expect(res.status).toBe(400);
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('POST maps MediaValidationError to 400 with its message', async () => {
    mediaService.upload.mockRejectedValue(
      new MediaValidationError('Image must be 4 MB or smaller')
    );
    const res = await post(imageForm());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Image must be 4 MB or smaller',
    });
  });

  it('POST maps an unexpected error to 500 "Unable to upload image"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mediaService.upload.mockRejectedValue(
      new Error('Storage is not configured')
    );
    const res = await post(imageForm());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Unable to upload image',
    });
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
    await expect(res.json()).resolves.toEqual({
      error: 'Unable to load media',
    });
  });

  it('DELETE returns 204', async () => {
    mediaService.delete.mockResolvedValue(undefined);
    const res = await del({ path: 'a.jpg' });
    expect(res.status).toBe(204);
    expect(mediaService.delete).toHaveBeenCalledWith({ path: 'a.jpg' });
  });

  it('DELETE maps "not found" to 404', async () => {
    mediaService.delete.mockRejectedValue(
      new Error('Media file a.jpg not found')
    );
    const res = await del({ path: 'a.jpg' });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: 'Media file a.jpg not found',
    });
  });

  it('DELETE with an empty path returns 400', async () => {
    const res = await del({ path: '' });
    expect(res.status).toBe(400);
    expect(mediaService.delete).not.toHaveBeenCalled();
  });
});
