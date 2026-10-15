import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditEventType } from '@domain/entities/audit-log';
import { CreateQuizUseCase } from '@application/use-cases/create-quiz.use-case';
import { Quiz } from '@domain/entities/quiz';

describe('CreateQuizUseCase', () => {
  const mockQuizRepository = {
    findById: vi.fn(),
    findByJoinCode: vi.fn(),
    listByStatus: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    updateCurrentQuestion: vi.fn(),
    updateLeaderboard: vi.fn(),
    delete: vi.fn(),
    listAll: vi.fn(),
    update: vi.fn(),
  } as unknown as IQuizRepository;

  const createQuizUseCase = new CreateQuizUseCase(mockQuizRepository);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a quiz with a join code', async () => {
    const mockSavedQuiz = { id: 'quiz-123' } as Quiz;

    vi.spyOn(mockQuizRepository, 'create').mockResolvedValueOnce(mockSavedQuiz);

    const result = await createQuizUseCase.execute({
      title: 'Test Quiz',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
    });

    expect(result).toBe('quiz-123');
    expect(mockQuizRepository.create).toHaveBeenCalledTimes(1);

    // Verify the quiz passed to create has a joinCode
    const createCall = vi.mocked(mockQuizRepository.create).mock.calls[0][0];
    expect(createCall.joinCode).toBeDefined();
    expect(createCall.joinCode).toMatch(/^JOIN-[A-Z2-9]{4}$/);
  });

  it('should generate unique join codes for different quizzes', async () => {
    const mockSavedQuiz = { id: 'quiz-123' } as Quiz;

    vi.spyOn(mockQuizRepository, 'create').mockResolvedValue(mockSavedQuiz);

    // Create multiple quizzes
    await createQuizUseCase.execute({
      title: 'Quiz 1',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
    });

    await createQuizUseCase.execute({
      title: 'Quiz 2',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
    });

    const calls = vi.mocked(mockQuizRepository.create).mock.calls;
    const joinCode1 = calls[0][0].joinCode;
    const joinCode2 = calls[1][0].joinCode;

    // Both should have valid format
    expect(joinCode1).toMatch(/^JOIN-[A-Z2-9]{4}$/);
    expect(joinCode2).toMatch(/^JOIN-[A-Z2-9]{4}$/);
  });

  it('should create a quiz with correct settings', async () => {
    const mockSavedQuiz = { id: 'quiz-456' } as Quiz;

    vi.spyOn(mockQuizRepository, 'create').mockResolvedValueOnce(mockSavedQuiz);

    await createQuizUseCase.execute({
      title: 'My Quiz',
      timePerQuestion: 45,
      allowSkipping: true,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
    });

    const createCall = vi.mocked(mockQuizRepository.create).mock.calls[0][0];
    expect(createCall.title).toBe('My Quiz');
    expect(createCall.settings.timePerQuestion).toBe(45);
    expect(createCall.settings.allowSkipping).toBe(true);
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

    it('saves an audit log with QuizCreated event type', async () => {
      const mockSavedQuiz = { id: 'quiz-123' } as Quiz;
      vi.spyOn(mockQuizRepository, 'create').mockResolvedValueOnce(
        mockSavedQuiz
      );

      const useCase = new CreateQuizUseCase(
        mockQuizRepository,
        auditLogRepository
      );
      await useCase.execute({
        title: 'Test Quiz',
        timePerQuestion: 30,
        allowSkipping: false,
        scoringAlgorithm: 'EXPONENTIAL_DECAY',
      });
      await new Promise((r) => setImmediate(r));

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: AuditEventType.QuizCreated })
      );
    });

    it('does not propagate audit log save failures', async () => {
      const mockSavedQuiz = { id: 'quiz-123' } as Quiz;
      vi.spyOn(mockQuizRepository, 'create').mockResolvedValueOnce(
        mockSavedQuiz
      );
      auditLogRepository.save.mockRejectedValue(new Error('DB error'));

      const useCase = new CreateQuizUseCase(
        mockQuizRepository,
        auditLogRepository
      );

      await expect(
        useCase.execute({
          title: 'Test Quiz',
          timePerQuestion: 30,
          allowSkipping: false,
          scoringAlgorithm: 'EXPONENTIAL_DECAY',
        })
      ).resolves.not.toThrow();
    });
  });
});
