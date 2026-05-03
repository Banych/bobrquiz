import { ResetQuizUseCase } from '@application/use-cases/reset-quiz.use-case';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Quiz, QuizStatus } from '@domain/entities/quiz';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('ResetQuizUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let resetQuizUseCase: ResetQuizUseCase;

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
    resetQuizUseCase = new ResetQuizUseCase(quizRepository);
  });

  it('resets a completed quiz and saves it', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quiz.startQuiz();
    quiz.endQuiz();
    quizRepository.findById.mockResolvedValue(quiz);

    await resetQuizUseCase.execute('quiz1');

    expect(quizRepository.findById).toHaveBeenCalledWith('quiz1');
    expect(quiz.quizStatus).toBe(QuizStatus.Pending);
    expect(quizRepository.save).toHaveBeenCalledWith(quiz);
  });

  it('throws "Quiz not found." when quiz does not exist', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(resetQuizUseCase.execute('missing')).rejects.toThrow(
      'Quiz not found.'
    );
    expect(quizRepository.save).not.toHaveBeenCalled();
  });

  it('propagates entity error for invalid state (already Pending)', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quizRepository.findById.mockResolvedValue(quiz);

    await expect(resetQuizUseCase.execute('quiz1')).rejects.toThrow(
      'Quiz can only be reset if it is in Active or Completed status.'
    );
    expect(quizRepository.save).not.toHaveBeenCalled();
  });
});
