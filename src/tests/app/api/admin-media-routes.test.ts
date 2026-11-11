import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { $disconnect: vi.fn() },
}));
vi.mock('@infrastructure/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(),
}));

import { POST as uploadMedia } from '@/app/api/admin/quizzes/[quizId]/media/route';
import { DELETE as deleteMedia } from '@/app/api/admin/quizzes/[quizId]/media/[fileName]/route';
import { GET as listMedia } from '@/app/api/admin/media/route';
import * as servicesModule from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import { Quiz } from '@domain/entities/quiz';
import { AssertQuizOwnerUseCase } from '@application/use-cases/assert-quiz-owner.use-case';
import { UploadQuizMediaUseCase } from '@application/use-cases/quiz-media/upload-quiz-media.use-case';
import { DeleteQuizMediaUseCase } from '@application/use-cases/quiz-media/delete-quiz-media.use-case';
import { ListOwnerMediaUseCase } from '@application/use-cases/quiz-media/list-owner-media.use-case';
import { FakeMediaStorage } from '@/tests/support/fake-media-storage';

type ServiceContainer = ReturnType<typeof servicesModule.getServices>;

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const FILE = '1731300000000-abc123.png';
const PATH = `questions/${A_QUIZ}/${FILE}`;

const quizzes: Record<string, Quiz> = {
  [A_QUIZ]: new Quiz(
    A_QUIZ,
    'Quiz A',
    [],
    { timePerQuestion: 30, allowSkipping: false },
    { ownerId: HOST_A }
  ),
};

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

const uploadRequest = (
  file: Blob | string | null,
  headers: Record<string, string> = {}
) => {
  const form = new FormData();
  if (file !== null) form.append('file', file);
  return new Request('http://localhost/api', {
    method: 'POST',
    body: form,
    headers,
  }) as unknown as NextRequest;
};
const pngFile = () => new File([PNG], 'photo.png', { type: 'image/png' });
const quizCtx = (quizId: string) => ({ params: Promise.resolve({ quizId }) });
const fileCtx = (quizId: string, fileName: string) => ({
  params: Promise.resolve({ quizId, fileName }),
});
const emptyRequest = () =>
  new Request('http://localhost/api', {
    method: 'DELETE',
  }) as unknown as NextRequest;

describe('Admin media routes', () => {
  const quizRepository = {
    findEntityById: vi.fn(),
    listByOwner: vi.fn(),
  } as unknown as IQuizRepository;
  let storage: FakeMediaStorage;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storage = new FakeMediaStorage();
    storage.seed(PATH);

    const assertOwner = new AssertQuizOwnerUseCase(quizRepository);
    const upload = new UploadQuizMediaUseCase(
      quizRepository,
      storage,
      assertOwner
    );
    const remove = new DeleteQuizMediaUseCase(storage, assertOwner);
    const list = new ListOwnerMediaUseCase(quizRepository, storage);
    vi.spyOn(servicesModule, 'getServices').mockReturnValue({
      mediaService: {
        uploadQuizMedia: (input) => upload.execute(input),
        deleteQuizMedia: (input) => remove.execute(input),
        listOwnerMedia: (ownerId) => list.execute(ownerId),
      },
    } as ServiceContainer);

    vi.mocked(quizRepository.findEntityById).mockImplementation(
      async (id: string) => quizzes[id] ?? null
    );
    vi.mocked(quizRepository.listByOwner).mockImplementation(
      async (ownerId: string) =>
        Object.values(quizzes).filter((quiz) => quiz.ownerId === ownerId)
    );
    vi.mocked(getCurrentUserId).mockResolvedValue(HOST_A);
  });

  describe('as the owner', () => {
    it('uploads an image and answers 201 with its URL', async () => {
      const response = await uploadMedia(
        uploadRequest(pngFile()),
        quizCtx(A_QUIZ)
      );
      const body = (await response.json()) as { path: string; url: string };

      expect(response.status).toBe(201);
      expect(body.path).toMatch(/^questions\/quiz-a\/\d+-[a-z0-9]+\.png$/);
      expect(storage.objects.has(body.path)).toBe(true);
    });

    it('deletes a file', async () => {
      const response = await deleteMedia(emptyRequest(), fileCtx(A_QUIZ, FILE));

      expect(response.status).toBe(200);
      expect(storage.objects.has(PATH)).toBe(false);
    });

    it('lists their files', async () => {
      const response = await listMedia();
      const body = (await response.json()) as Array<{ path: string }>;

      expect(response.status).toBe(200);
      expect(body.map((file) => file.path)).toEqual([PATH]);
    });

    it.each([
      [
        'bytes that are not an image',
        () => new File(['<html>'], 'x.png', { type: 'image/png' }),
      ],
      ['a text field instead of a file', () => 'not a file'],
    ])('answers 400 to %s and stores nothing', async (_name, makeFile) => {
      const response = await uploadMedia(
        uploadRequest(makeFile()),
        quizCtx(A_QUIZ)
      );

      expect(response.status).toBe(400);
      expect(storage.objects.size).toBe(1);
    });

    it('answers 400 when the file field is missing', async () => {
      const response = await uploadMedia(uploadRequest(null), quizCtx(A_QUIZ));
      expect(response.status).toBe(400);
    });

    it('answers 400 to a declared body far over 4 MB before reading it', async () => {
      const response = await uploadMedia(
        uploadRequest(pngFile(), { 'content-length': String(5 * 1024 * 1024) }),
        quizCtx(A_QUIZ)
      );

      expect(response.status).toBe(400);
      expect(storage.objects.size).toBe(1);
    });

    it('answers 400 to a file name that could leave the folder', async () => {
      const response = await deleteMedia(
        emptyRequest(),
        fileCtx(A_QUIZ, `../other-quiz/${FILE}`)
      );
      expect(response.status).toBe(400);
    });

    it('answers 404 to a missing file', async () => {
      const response = await deleteMedia(
        emptyRequest(),
        fileCtx(A_QUIZ, '1731300000000-gone.png')
      );
      expect(response.status).toBe(404);
    });

    it('answers 500 when storage is not configured', async () => {
      vi.spyOn(storage, 'upload').mockRejectedValue(
        new Error(
          'Media storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing)'
        )
      );

      const response = await uploadMedia(
        uploadRequest(pngFile()),
        quizCtx(A_QUIZ)
      );
      expect(response.status).toBe(500);
    });
  });

  describe("as another host (not the quiz's owner)", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);
    });

    it('gets 404 on upload and stores nothing', async () => {
      const response = await uploadMedia(
        uploadRequest(pngFile()),
        quizCtx(A_QUIZ)
      );

      expect(response.status).toBe(404);
      expect(storage.objects.size).toBe(1);
    });

    it('gets 404 on delete, whatever the name, and the file stays', async () => {
      for (const name of [FILE, '../x', 'not-a-name']) {
        const response = await deleteMedia(
          emptyRequest(),
          fileCtx(A_QUIZ, name)
        );
        expect(response.status, name).toBe(404);
      }
      expect(storage.objects.has(PATH)).toBe(true);
    });

    it("sees none of the owner's files in the list", async () => {
      const response = await listMedia();
      await expect(response.json()).resolves.toEqual([]);
    });
  });

  describe('with no session', () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);
    });

    it('gets 401 from every route and changes nothing', async () => {
      const responses = await Promise.all([
        uploadMedia(uploadRequest(pngFile()), quizCtx(A_QUIZ)),
        deleteMedia(emptyRequest(), fileCtx(A_QUIZ, FILE)),
        listMedia(),
      ]);

      expect(responses.map((response) => response.status)).toEqual([
        401, 401, 401,
      ]);
      expect([...storage.objects.keys()]).toEqual([PATH]);
    });
  });
});
