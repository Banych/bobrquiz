import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import { AssertQuizOwnerUseCase } from '@application/use-cases/assert-quiz-owner.use-case';
import { Quiz } from '@domain/entities/quiz';

const makeQuiz = (ownerId: string): Quiz =>
  new Quiz(
    'quiz-1',
    'Title',
    [],
    { timePerQuestion: 30, allowSkipping: false },
    { ownerId }
  );

describe('AssertQuizOwnerUseCase', () => {
  const mockQuizRepository = {
    findEntityById: vi.fn(),
  } as unknown as IQuizRepository;
  const useCase = new AssertQuizOwnerUseCase(mockQuizRepository);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves with nothing for the owner', async () => {
    vi.mocked(mockQuizRepository.findEntityById).mockResolvedValue(
      makeQuiz('owner-1')
    );

    await expect(useCase.execute('quiz-1', 'owner-1')).resolves.toBeUndefined();
    expect(mockQuizRepository.findEntityById).toHaveBeenCalledWith('quiz-1');
  });

  it('throws the standard not-found error for a non-owner', async () => {
    vi.mocked(mockQuizRepository.findEntityById).mockResolvedValue(
      makeQuiz('owner-1')
    );

    await expect(useCase.execute('quiz-1', 'someone-else')).rejects.toThrow(
      'Quiz with ID quiz-1 not found'
    );
  });

  it('throws the same error for a missing quiz', async () => {
    vi.mocked(mockQuizRepository.findEntityById).mockResolvedValue(null);

    await expect(useCase.execute('quiz-1', 'owner-1')).rejects.toThrow(
      'Quiz with ID quiz-1 not found'
    );
  });

  it('throws not-found for an empty owner id even when the quiz has none', async () => {
    vi.mocked(mockQuizRepository.findEntityById).mockResolvedValue(
      makeQuiz('')
    );

    await expect(useCase.execute('quiz-1', '')).rejects.toThrow(
      'Quiz with ID quiz-1 not found'
    );
  });
});
