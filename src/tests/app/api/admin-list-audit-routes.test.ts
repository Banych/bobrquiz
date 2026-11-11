import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { Quiz } from '@domain/entities/quiz';
import { Question } from '@domain/entities/question';
import { AuditLog, AuditEventType } from '@domain/entities/audit-log';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { $disconnect: vi.fn() },
}));
vi.mock('@infrastructure/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(),
}));

import { GET as listAllQuestions } from '@/app/api/admin/questions/route';
import { GET as listAuditLogs } from '@/app/api/admin/audit/route';
import * as servicesModule from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';
import { ListAllQuestionsUseCase } from '@application/use-cases/list-all-questions.use-case';
import { ListAuditLogsUseCase } from '@application/use-cases/audit/list-audit-logs.use-case';

type ServiceContainer = ReturnType<typeof servicesModule.getServices>;

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const B_QUIZ = 'quiz-b';

// Two hosts' data: each quiz has one question and one log; one log has no quiz.
const settings = { timePerQuestion: 30, allowSkipping: false };
const quizzes = [
  new Quiz(A_QUIZ, 'A quiz', [], settings, { ownerId: HOST_A }),
  new Quiz(B_QUIZ, 'B quiz', [], settings, { ownerId: HOST_B }),
];
const questionsByQuiz: Record<string, Question[]> = {
  [A_QUIZ]: [new Question('question-a', 'A?', ['a'], 'text', 1)],
  [B_QUIZ]: [new Question('question-b', 'B?', ['b'], 'text', 1)],
};
const logs = [
  new AuditLog('log-a', AuditEventType.QuizCreated, { quizId: A_QUIZ }),
  new AuditLog('log-b', AuditEventType.QuizCreated, { quizId: B_QUIZ }),
  new AuditLog('log-orphan', AuditEventType.QuizCreated, {}),
];
const ownerOf = (quizId?: string) =>
  quizzes.find((quiz) => quiz.id === quizId)?.ownerId;

const quizRepo = {
  listByOwner: vi.fn(),
  findAll: vi.fn(),
  findEntityById: vi.fn(),
} as unknown as IQuizRepository;
const questionRepo = {
  listByQuizId: vi.fn(),
} as unknown as IQuestionRepository;
// Behaves like the Prisma query: owner filter through the quiz relation, so a
// log with no quiz never matches.
const auditRepo = {
  save: vi.fn(),
  findForOwner: vi.fn(),
} as IAuditLogRepository;

const get = (path: string) => new Request(`http://localhost${path}`);

describe('Cross-quiz question list and audit log ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(quizRepo.listByOwner).mockImplementation(async (ownerId) =>
      quizzes.filter((quiz) => quiz.ownerId === ownerId)
    );
    vi.mocked(quizRepo.findAll).mockResolvedValue(quizzes);
    vi.mocked(questionRepo.listByQuizId).mockImplementation(
      async (quizId) => questionsByQuiz[quizId] ?? []
    );
    vi.mocked(auditRepo.findForOwner).mockImplementation(
      async (ownerId, options = {}) =>
        logs.filter(
          (log) =>
            ownerOf(log.quizId) === ownerId &&
            (!options.quizId || log.quizId === options.quizId)
        )
    );
    vi.spyOn(servicesModule, 'getServices').mockReturnValue({
      questionService: {
        listAllQuestions: (params: { ownerId: string }) =>
          new ListAllQuestionsUseCase(quizRepo, questionRepo).execute(params),
      },
      auditService: {
        listAuditLogs: (params: { ownerId: string }) =>
          new ListAuditLogsUseCase(auditRepo).execute(params),
      },
    } as unknown as ServiceContainer);
    vi.mocked(getCurrentUserId).mockResolvedValue(HOST_A);
  });

  describe('GET /api/admin/questions', () => {
    it("lists only the signed-in host's questions", async () => {
      const response = await listAllQuestions(get('/api/admin/questions'));
      const body = (await response.json()) as { id: string; quizId: string }[];

      expect(response.status).toBe(200);
      expect(body.map((q) => q.id)).toEqual(['question-a']);
      expect(body.every((q) => q.quizId === A_QUIZ)).toBe(true);
      expect(quizRepo.findAll).not.toHaveBeenCalled();
    });

    it("gives an empty list for another host's quizId", async () => {
      const response = await listAllQuestions(
        get(`/api/admin/questions?quizId=${B_QUIZ}`)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expect(questionRepo.listByQuizId).not.toHaveBeenCalled();
    });

    it('returns 401 without a session and reads nothing', async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);

      const response = await listAllQuestions(get('/api/admin/questions'));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(quizRepo.listByOwner).not.toHaveBeenCalled();
      expect(questionRepo.listByQuizId).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/audit', () => {
    it("lists only logs of the signed-in host's quizzes, never quizless ones", async () => {
      const response = await listAuditLogs(get('/api/admin/audit'));
      const body = (await response.json()) as { id: string }[];

      expect(response.status).toBe(200);
      expect(body.map((log) => log.id)).toEqual(['log-a']);
      expect(auditRepo.findForOwner).toHaveBeenCalledWith(HOST_A, {
        quizId: undefined,
        limit: 100,
      });
    });

    it("gives an empty list for another host's quizId", async () => {
      const response = await listAuditLogs(
        get(`/api/admin/audit?quizId=${B_QUIZ}&limit=10`)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expect(auditRepo.findForOwner).toHaveBeenCalledWith(HOST_A, {
        quizId: B_QUIZ,
        limit: 10,
      });
    });

    it('returns 401 without a session and reads nothing', async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);

      const response = await listAuditLogs(get('/api/admin/audit'));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(auditRepo.findForOwner).not.toHaveBeenCalled();
    });
  });
});
