import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import { ListQuizzesByOwnerUseCase } from '@application/use-cases/list-quizzes-by-owner.use-case';
import { Quiz } from '@domain/entities/quiz';

const makeQuiz = (id: string, title: string, ownerId: string): Quiz =>
  new Quiz(
    id,
    title,
    [],
    { timePerQuestion: 30, allowSkipping: false },
    { ownerId, joinCode: 'JOIN-ABCD' }
  );

describe('ListQuizzesByOwnerUseCase', () => {
  const mockQuizRepository = {
    findAll: vi.fn(),
    listByOwner: vi.fn(),
  } as unknown as IQuizRepository;
  const useCase = new ListQuizzesByOwnerUseCase(mockQuizRepository);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns list items for exactly what listByOwner gives', async () => {
    vi.mocked(mockQuizRepository.listByOwner).mockResolvedValue([
      makeQuiz('q1', 'Mine', 'owner-1'),
    ]);

    const result = await useCase.execute('owner-1');

    expect(mockQuizRepository.listByOwner).toHaveBeenCalledWith('owner-1');
    expect(mockQuizRepository.findAll).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'q1',
      title: 'Mine',
      questionCount: 0,
      playerCount: 0,
      timePerQuestion: 30,
      allowSkipping: false,
      joinCode: 'JOIN-ABCD',
    });
  });

  it('returns an empty list when the owner has no quizzes', async () => {
    vi.mocked(mockQuizRepository.listByOwner).mockResolvedValue([]);

    await expect(useCase.execute('owner-2')).resolves.toEqual([]);
  });
});
