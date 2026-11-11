import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { $disconnect: vi.fn() },
}));
vi.mock('@infrastructure/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(),
}));

import {
  GET as listQuestions,
  POST as createQuestion,
} from '@/app/api/admin/quizzes/[quizId]/questions/route';
import {
  GET as getQuestion,
  PATCH as updateQuestion,
  DELETE as deleteQuestion,
} from '@/app/api/admin/quizzes/[quizId]/questions/[questionId]/route';
import { POST as reorderQuestions } from '@/app/api/admin/quizzes/[quizId]/questions/reorder/route';
import * as servicesModule from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';
import type { IQuestionRepository } from '@domain/repositories/question-repository';
import { Question } from '@domain/entities/question';
import { GetQuizQuestionUseCase } from '@application/use-cases/get-quiz-question.use-case';
import { UpdateQuestionUseCase } from '@application/use-cases/update-question.use-case';
import { DeleteQuestionUseCase } from '@application/use-cases/delete-question.use-case';
import { ReorderQuestionsUseCase } from '@application/use-cases/reorder-questions.use-case';
import { FakeMediaStorage } from '@/tests/support/fake-media-storage';

type ServiceContainer = ReturnType<typeof servicesModule.getServices>;

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const B_QUIZ = 'quiz-b';
const A_QUESTION = 'question-a';
const B_QUESTION = 'question-b';
const MISSING_QUIZ = 'quiz-missing';
const MISSING_QUESTION = 'question-missing';

const owners: Record<string, string> = { [A_QUIZ]: HOST_A, [B_QUIZ]: HOST_B };

const makeQuestion = (id: string, quizId: string): Question => {
  const question = new Question(id, 'Original text', ['Paris'], 'text', 10);
  question.quizId = quizId;
  return question;
};

const quizCtx = (quizId: string) => ({ params: Promise.resolve({ quizId }) });
const questionCtx = (quizId: string, questionId: string) => ({
  params: Promise.resolve({ quizId, questionId }),
});
const request = (body?: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;

const newQuestion = {
  text: 'New question',
  type: 'text',
  correctAnswers: ['yes'],
};

describe('Admin question routes ownership', () => {
  const questions: Record<string, Question> = {};
  const questionRepository = {
    findById: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    updateOrder: vi.fn(),
  } as unknown as IQuestionRepository;

  const quizService = { assertQuizOwner: vi.fn() };
  // The question-in-quiz rule runs through the real use cases; only the
  // repository is mocked.
  const questionService = {
    listQuizQuestions: vi.fn(),
    createQuestion: vi.fn(),
    getQuizQuestion: (quizId: string, questionId: string) =>
      new GetQuizQuestionUseCase(questionRepository).execute(
        quizId,
        questionId
      ),
    updateQuestion: (
      quizId: string,
      questionId: string,
      dto: Parameters<UpdateQuestionUseCase['execute']>[2]
    ) =>
      new UpdateQuestionUseCase(
        questionRepository,
        new FakeMediaStorage()
      ).execute(quizId, questionId, dto),
    deleteQuestion: (quizId: string, questionId: string) =>
      new DeleteQuestionUseCase(questionRepository).execute(quizId, questionId),
    reorderQuestions: (
      dto: Parameters<ReorderQuestionsUseCase['execute']>[0],
      quizId: string
    ) => new ReorderQuestionsUseCase(questionRepository).execute(dto, quizId),
  };

  // Every handler, called on a given quiz (and question, where it takes one).
  const handlers = [
    ['list', (quizId: string) => listQuestions(request(), quizCtx(quizId))],
    [
      'create',
      (quizId: string) => createQuestion(request(newQuestion), quizCtx(quizId)),
    ],
    [
      'read',
      (quizId: string, questionId = A_QUESTION) =>
        getQuestion(request(), questionCtx(quizId, questionId)),
    ],
    [
      'update',
      (quizId: string, questionId = A_QUESTION) =>
        updateQuestion(
          request({ text: 'Hijack' }),
          questionCtx(quizId, questionId)
        ),
    ],
    [
      'delete',
      (quizId: string, questionId = A_QUESTION) =>
        deleteQuestion(request(), questionCtx(quizId, questionId)),
    ],
    [
      'reorder',
      (quizId: string, questionId = A_QUESTION) =>
        reorderQuestions(
          request({ questions: [{ id: questionId, orderIndex: 0 }] }),
          quizCtx(quizId)
        ),
    ],
  ] as const;

  const expectNothingChanged = () => {
    expect(questionService.createQuestion).not.toHaveBeenCalled();
    expect(questionRepository.save).not.toHaveBeenCalled();
    expect(questionRepository.delete).not.toHaveBeenCalled();
    expect(questionRepository.updateOrder).not.toHaveBeenCalled();
    expect(questions[A_QUESTION].text).toBe('Original text');
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(servicesModule, 'getServices').mockReturnValue({
      quizService: quizService as unknown as ServiceContainer['quizService'],
      questionService:
        questionService as unknown as ServiceContainer['questionService'],
    } as ServiceContainer);

    questions[A_QUESTION] = makeQuestion(A_QUESTION, A_QUIZ);
    questions[B_QUESTION] = makeQuestion(B_QUESTION, B_QUIZ);
    vi.mocked(questionRepository.findById).mockImplementation(
      async (id: string) => questions[id] ?? null
    );
    quizService.assertQuizOwner.mockImplementation(
      async (quizId: string, ownerId: string) => {
        if (owners[quizId] !== ownerId) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
      }
    );
    questionService.listQuizQuestions.mockResolvedValue([{ id: A_QUESTION }]);
    questionService.createQuestion.mockImplementation(async () =>
      makeQuestion('question-new', A_QUIZ)
    );
    vi.mocked(getCurrentUserId).mockResolvedValue(HOST_A);
  });

  describe('as the owner', () => {
    it.each(handlers)('%s succeeds on their own quiz', async (_name, run) => {
      const response = await run(A_QUIZ);

      expect(response.status).toBeLessThan(300);
      expect(quizService.assertQuizOwner).toHaveBeenCalledWith(A_QUIZ, HOST_A);
    });
  });

  describe("as another host (not the quiz's owner)", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);
    });

    it.each(handlers)(
      "%s gets 404 on the other host's quiz and changes nothing",
      async (_name, run) => {
        const response = await run(A_QUIZ);

        expect(response.status).toBe(404);
        expect(questionService.listQuizQuestions).not.toHaveBeenCalled();
        expectNothingChanged();
      }
    );

    it.each(handlers)(
      '%s answers a missing quiz with the same status and body',
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

  describe("a question id from another quiz, under the caller's own quiz", () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);
    });

    const questionHandlers = handlers.filter(([name]) =>
      ['read', 'update', 'delete', 'reorder'].includes(name)
    );

    it.each(questionHandlers)(
      '%s gets 404 and changes nothing',
      async (_name, run) => {
        const response = await run(B_QUIZ, A_QUESTION);

        expect(response.status).toBe(404);
        expect(JSON.stringify(await response.json())).not.toContain(A_QUIZ);
        expectNothingChanged();
      }
    );

    it.each(questionHandlers)(
      '%s answers it exactly like a missing question',
      async (_name, run) => {
        const otherQuiz = await run(B_QUIZ, A_QUESTION);
        const missing = await run(B_QUIZ, MISSING_QUESTION);

        expect(missing.status).toBe(otherQuiz.status);
        const normalize = async (response: Response, id: string) =>
          JSON.stringify(await response.json()).replaceAll(id, '<id>');
        expect(await normalize(missing, MISSING_QUESTION)).toBe(
          await normalize(otherQuiz, A_QUESTION)
        );
      }
    );
  });

  describe('hostile request bodies (issue 152)', () => {
    it('create rejects a string body as a whole, without spreading it', async () => {
      const response = await createQuestion(
        request('x'.repeat(1000)),
        quizCtx(A_QUIZ)
      );

      expect(response.status).toBe(400);
      // Spread first, the string would become 1000 keys and fail on the
      // missing fields instead of on the body's type.
      const { error } = (await response.json()) as { error: string };
      expect(error).toMatch(/expected object, received string/);
      expect(JSON.parse(error)).toHaveLength(1);
      expect(questionService.createQuestion).not.toHaveBeenCalled();
    });

    it('reorder answers an oversized list with 400 and changes nothing', async () => {
      const questions = Array.from({ length: 501 }, (_, i) => ({
        id: `q${i}`,
        orderIndex: i,
      }));

      const response = await reorderQuestions(
        request({ questions }),
        quizCtx(A_QUIZ)
      );

      expect(response.status).toBe(400);
      expectNothingChanged();
    });
  });

  describe('without a session', () => {
    beforeEach(() => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);
    });

    it.each(handlers)(
      '%s returns 401 and calls no service',
      async (_name, run) => {
        const response = await run(A_QUIZ);

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
        expect(quizService.assertQuizOwner).not.toHaveBeenCalled();
        expect(questionRepository.findById).not.toHaveBeenCalled();
        expectNothingChanged();
      }
    );
  });
});
