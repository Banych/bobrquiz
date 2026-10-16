import { StartQuizUseCase } from '@application/use-cases/start-quiz.use-case';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Quiz, QuizStatus } from '@domain/entities/quiz';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditEventType } from '@domain/entities/audit-log';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('StartQuizUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let startQuizUseCase: StartQuizUseCase;

  beforeEach(() => {
    quizRepository = {
      findById: vi.fn(),
      findByJoinCode: vi.fn(),
      listByStatus: vi.fn(),
      save: vi.fn(),
      updateCurrentQuestion: vi.fn(),
      updateLeaderboard: vi.fn(),
      delete: vi.fn(),
      clearQuestionLocks: vi.fn(),
    } as unknown as Mocked<IQuizRepository>;
    startQuizUseCase = new StartQuizUseCase(quizRepository);
  });

  it('should start a quiz and update its status to Active', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quizRepository.findById.mockResolvedValue(quiz);

    await startQuizUseCase.execute('quiz1');

    expect(quizRepository.findById).toHaveBeenCalledWith('quiz1');
    expect(quiz.quizStatus).toBe(QuizStatus.Active);
    expect(quiz.timerStartTime).toBeDefined();
    expect(quizRepository.save).toHaveBeenCalledWith(quiz);
    expect(quizRepository.clearQuestionLocks).toHaveBeenCalledWith('quiz1');
    expect(
      quizRepository.clearQuestionLocks.mock.invocationCallOrder[0]
    ).toBeLessThan(quizRepository.save.mock.invocationCallOrder[0]);
  });

  it('should throw an error if the quiz is not found', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(startQuizUseCase.execute('invalidQuizId')).rejects.toThrow(
      'Quiz not found.'
    );
    expect(quizRepository.findById).toHaveBeenCalledWith('invalidQuizId');
    expect(quizRepository.save).not.toHaveBeenCalled();
    expect(quizRepository.clearQuestionLocks).not.toHaveBeenCalled();
  });

  it('rejects a quiz that is not Pending and clears nothing', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quiz.startQuiz();
    quizRepository.findById.mockResolvedValue(quiz);

    await expect(startQuizUseCase.execute('quiz1')).rejects.toThrow(
      'Quiz can only be started if it is in Pending status.'
    );
    expect(quizRepository.clearQuestionLocks).not.toHaveBeenCalled();
    expect(quizRepository.save).not.toHaveBeenCalled();
  });

  describe('audit log emission', () => {
    let auditLogRepository: Mocked<IAuditLogRepository>;

    beforeEach(() => {
      auditLogRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        findByQuizId: vi.fn(),
        findRecent: vi.fn(),
      };
    });

    it('saves an audit log with QuizStarted event type', async () => {
      const quiz = new QuizSessionAggregate(
        new Quiz('quiz1', 'Sample Quiz', [], {
          timePerQuestion: 30,
          allowSkipping: true,
        }),
        30
      );
      quizRepository.findById.mockResolvedValue(quiz);
      const useCase = new StartQuizUseCase(quizRepository, auditLogRepository);

      await useCase.execute('quiz1');
      await new Promise((r) => setImmediate(r));

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: AuditEventType.QuizStarted })
      );
    });

    it('does not propagate audit log save failures', async () => {
      const quiz = new QuizSessionAggregate(
        new Quiz('quiz1', 'Sample Quiz', [], {
          timePerQuestion: 30,
          allowSkipping: true,
        }),
        30
      );
      quizRepository.findById.mockResolvedValue(quiz);
      auditLogRepository.save.mockRejectedValue(new Error('DB error'));
      const useCase = new StartQuizUseCase(quizRepository, auditLogRepository);

      await expect(useCase.execute('quiz1')).resolves.not.toThrow();
    });
  });
});
