import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { $disconnect: vi.fn() },
}));
vi.mock('@infrastructure/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(),
}));

import {
  GET as listQuizzes,
  POST as createQuiz,
} from '@/app/api/admin/quizzes/route';
import {
  GET as getQuiz,
  PATCH as updateQuiz,
  DELETE as deleteQuiz,
} from '@/app/api/admin/quizzes/[quizId]/route';
import { POST as resetQuiz } from '@/app/api/admin/quizzes/[quizId]/reset/route';
import * as servicesModule from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

type ServiceContainer = ReturnType<typeof servicesModule.getServices>;

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const notFound = (quizId: string) =>
  new Error(`Quiz with ID ${quizId} not found`);

const ctx = (quizId: string) => ({ params: Promise.resolve({ quizId }) });
const jsonRequest = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('Admin quiz routes ownership', () => {
  const quizService = {
    listQuizzesByOwner: vi.fn(),
    createQuiz: vi.fn(),
    assertQuizOwner: vi.fn(),
    getQuizState: vi.fn(),
    updateQuiz: vi.fn(),
    deleteQuiz: vi.fn(),
    resetQuiz: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(servicesModule, 'getServices').mockReturnValue({
      quizService: quizService as unknown as ServiceContainer['quizService'],
    } as ServiceContainer);
    quizService.assertQuizOwner.mockImplementation(
      async (quizId: string, ownerId: string) => {
        if (quizId !== A_QUIZ || ownerId !== HOST_A) throw notFound(quizId);
      }
    );
    quizService.listQuizzesByOwner.mockImplementation(
      async (ownerId: string) => (ownerId === HOST_A ? [{ id: A_QUIZ }] : [])
    );
    vi.mocked(getCurrentUserId).mockResolvedValue(HOST_A);
  });

  describe('as the owner', () => {
    it('lists only their quizzes', async () => {
      const response = await listQuizzes();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ id: A_QUIZ }]);
      expect(quizService.listQuizzesByOwner).toHaveBeenCalledWith(HOST_A);
    });

    it('creates a quiz with the session user as owner', async () => {
      quizService.createQuiz.mockResolvedValue('new-quiz');

      const response = await createQuiz(jsonRequest({ title: 'My quiz' }));

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: 'new-quiz' });
      expect(quizService.createQuiz).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My quiz' }),
        HOST_A
      );
    });

    it('reads, updates, deletes and resets their quiz', async () => {
      quizService.getQuizState.mockResolvedValue({ id: A_QUIZ });

      expect((await getQuiz(jsonRequest({}), ctx(A_QUIZ))).status).toBe(200);
      expect(
        (await updateQuiz(jsonRequest({ title: 'New' }), ctx(A_QUIZ))).status
      ).toBe(200);
      expect((await deleteQuiz(jsonRequest({}), ctx(A_QUIZ))).status).toBe(200);
      expect((await resetQuiz(jsonRequest({}), ctx(A_QUIZ))).status).toBe(200);

      expect(quizService.assertQuizOwner).toHaveBeenCalledTimes(4);
      expect(quizService.assertQuizOwner).toHaveBeenCalledWith(A_QUIZ, HOST_A);
    });
  });

  describe("as another host (not the quiz's owner)", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);
    });

    it("does not list the other host's quiz", async () => {
      const response = await listQuizzes();

      expect(await response.json()).toEqual([]);
      expect(quizService.listQuizzesByOwner).toHaveBeenCalledWith(HOST_B);
    });

    it('gets 404 on read without touching the quiz', async () => {
      const response = await getQuiz(jsonRequest({}), ctx(A_QUIZ));

      expect(response.status).toBe(404);
      expect(quizService.getQuizState).not.toHaveBeenCalled();
    });

    it('gets 404 on update without updating', async () => {
      const response = await updateQuiz(
        jsonRequest({ title: 'Hijack' }),
        ctx(A_QUIZ)
      );

      expect(response.status).toBe(404);
      expect(quizService.updateQuiz).not.toHaveBeenCalled();
    });

    it('gets 404 on delete without deleting', async () => {
      const response = await deleteQuiz(jsonRequest({}), ctx(A_QUIZ));

      expect(response.status).toBe(404);
      expect(quizService.deleteQuiz).not.toHaveBeenCalled();
    });

    it('gets 404 on reset without resetting', async () => {
      const response = await resetQuiz(jsonRequest({}), ctx(A_QUIZ));

      expect(response.status).toBe(404);
      expect(quizService.resetQuiz).not.toHaveBeenCalled();
    });
  });

  describe('a quiz owned by someone else vs a missing quiz', () => {
    const MISSING_QUIZ = 'quiz-missing';
    const handlers = [
      ['GET', (id: string) => getQuiz(jsonRequest({}), ctx(id))],
      [
        'PATCH',
        (id: string) => updateQuiz(jsonRequest({ title: 'New' }), ctx(id)),
      ],
      ['DELETE', (id: string) => deleteQuiz(jsonRequest({}), ctx(id))],
      ['reset', (id: string) => resetQuiz(jsonRequest({}), ctx(id))],
    ] as const;

    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);
    });

    it.each(handlers)(
      '%s answers both with the same status and body',
      async (_name, run) => {
        const notYours = await run(A_QUIZ);
        const missing = await run(MISSING_QUIZ);

        expect(notYours.status).toBe(404);
        expect(missing.status).toBe(notYours.status);
        // The message echoes the id the caller sent; apart from that id the
        // two bodies must be identical.
        const normalize = async (response: Response, id: string) =>
          JSON.stringify(await response.json()).replaceAll(id, '<id>');
        expect(await normalize(missing, MISSING_QUIZ)).toBe(
          await normalize(notYours, A_QUIZ)
        );
      }
    );
  });

  describe('without a session', () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);
    });

    it('returns 401 on every handler and calls no service', async () => {
      const responses = await Promise.all([
        listQuizzes(),
        createQuiz(jsonRequest({ title: 'x' })),
        getQuiz(jsonRequest({}), ctx(A_QUIZ)),
        updateQuiz(jsonRequest({ title: 'x' }), ctx(A_QUIZ)),
        deleteQuiz(jsonRequest({}), ctx(A_QUIZ)),
        resetQuiz(jsonRequest({}), ctx(A_QUIZ)),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
      }
      for (const fn of Object.values(quizService)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  });
});
