import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { AdvanceQuestionUseCase } from '@application/use-cases/advance-question.use-case';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditEventType } from '@domain/entities/audit-log';
import { Quiz } from '@domain/entities/quiz';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Question } from '@domain/entities/question';

describe('AdvanceQuestionUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let useCase: AdvanceQuestionUseCase;

  beforeEach(() => {
    quizRepository = {
      findById: vi.fn(),
      findByJoinCode: vi.fn(),
      listByStatus: vi.fn(),
      save: vi.fn(),
      updateCurrentQuestion: vi.fn(),
      updateLeaderboard: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IQuizRepository>;

    useCase = new AdvanceQuestionUseCase(quizRepository);
  });

  it('moves the quiz to the next question and resets the timer', async () => {
    const quiz = new Quiz(
      'quiz-1',
      'General Knowledge',
      [
        new Question(
          'q-1',
          'Q1',
          ['A'],
          'multiple-choice',
          10,
          undefined,
          undefined,
          ['A', 'B']
        ),
        new Question(
          'q-2',
          'Q2',
          ['B'],
          'multiple-choice',
          10,
          undefined,
          undefined,
          ['A', 'B']
        ),
      ],
      { allowSkipping: false, timePerQuestion: 30 }
    );
    const aggregate = new QuizSessionAggregate(quiz, 30);
    aggregate.startQuiz();

    quizRepository.findById.mockResolvedValue(aggregate);

    const result = await useCase.execute('quiz-1');

    expect(result.question?.id).toBe('q-2');
    expect(result.timer.duration).toBe(30);
    expect(result.timer.remainingSeconds).toBeLessThanOrEqual(30);
    expect(result.timer.startTime).toMatch(/T/);
    expect(quizRepository.save).toHaveBeenCalledWith(aggregate);
  });

  it('completes the quiz and returns null question when on the last question', async () => {
    const quiz = new Quiz(
      'quiz-1',
      'General Knowledge',
      [
        new Question(
          'q-1',
          'Q1',
          ['A'],
          'multiple-choice',
          10,
          undefined,
          undefined,
          ['A', 'B']
        ),
      ],
      { allowSkipping: false, timePerQuestion: 30 }
    );
    const aggregate = new QuizSessionAggregate(quiz, 30);
    aggregate.startQuiz();

    quizRepository.findById.mockResolvedValue(aggregate);

    const result = await useCase.execute('quiz-1');

    expect(result.question).toBeNull();
    expect(aggregate.quizStatus).toBe('Completed');
    expect(quizRepository.save).toHaveBeenCalledWith(aggregate);
  });

  it('throws when quiz does not exist', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Quiz with ID missing not found.'
    );
  });

  describe('audit log emission', () => {
    let auditLogRepository: Mocked<IAuditLogRepository>;

    beforeEach(() => {
      auditLogRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        findForOwner: vi.fn(),
      };
    });

    it('saves an audit log with QuestionAdvanced event type', async () => {
      const quiz = new Quiz(
        'quiz-1',
        'General Knowledge',
        [
          new Question(
            'q-1',
            'Q1',
            ['A'],
            'multiple-choice',
            10,
            undefined,
            undefined,
            ['A', 'B']
          ),
          new Question(
            'q-2',
            'Q2',
            ['B'],
            'multiple-choice',
            10,
            undefined,
            undefined,
            ['A', 'B']
          ),
        ],
        { allowSkipping: false, timePerQuestion: 30 }
      );
      const aggregate = new QuizSessionAggregate(quiz, 30);
      aggregate.startQuiz();

      quizRepository.findById.mockResolvedValue(aggregate);
      useCase = new AdvanceQuestionUseCase(quizRepository, auditLogRepository);

      await useCase.execute('quiz-1');
      await new Promise((r) => setImmediate(r));

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: AuditEventType.QuestionAdvanced })
      );
    });

    it('does not propagate audit log save failures', async () => {
      const quiz = new Quiz(
        'quiz-1',
        'General Knowledge',
        [
          new Question(
            'q-1',
            'Q1',
            ['A'],
            'multiple-choice',
            10,
            undefined,
            undefined,
            ['A', 'B']
          ),
        ],
        { allowSkipping: false, timePerQuestion: 30 }
      );
      const aggregate = new QuizSessionAggregate(quiz, 30);
      aggregate.startQuiz();

      quizRepository.findById.mockResolvedValue(aggregate);
      auditLogRepository.save.mockRejectedValue(new Error('DB error'));
      useCase = new AdvanceQuestionUseCase(quizRepository, auditLogRepository);

      await expect(useCase.execute('quiz-1')).resolves.not.toThrow();
    });
  });
});
