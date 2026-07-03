import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { ListQuizPlayersUseCase } from '@application/use-cases/list-quiz-players.use-case';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import { Quiz } from '@domain/entities/quiz';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Question } from '@domain/entities/question';
import { Player } from '@domain/entities/player';

const buildAggregate = () => {
  const quiz = new Quiz(
    'quiz-1',
    'General Knowledge',
    [
      new Question(
        'q-1',
        'What is 2 + 2?',
        ['4'],
        'multiple-choice',
        10,
        undefined,
        undefined,
        ['3', '4']
      ),
    ],
    { allowSkipping: false, timePerQuestion: 30 }
  );
  const aggregate = new QuizSessionAggregate(quiz, 30);
  aggregate.addPlayer('player-1');
  return aggregate;
};

describe('ListQuizPlayersUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let useCase: ListQuizPlayersUseCase;

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

    playerRepository = {
      findById: vi.fn(),
      listByQuizId: vi.fn(),
      findByQuizIdAndName: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateScore: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IPlayerRepository>;

    useCase = new ListQuizPlayersUseCase(quizRepository, playerRepository);
  });

  it('returns player DTOs for a quiz', async () => {
    const aggregate = buildAggregate();
    const players = [new Player('player-1', 'Alice', 'quiz-1')];

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.listByQuizId.mockResolvedValue(players);

    const result = await useCase.execute('quiz-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('player-1');
    expect(quizRepository.findById).toHaveBeenCalledWith('quiz-1');
    expect(playerRepository.listByQuizId).toHaveBeenCalledWith('quiz-1');
  });

  it('excludes Removed players from the result', async () => {
    const aggregate = buildAggregate();
    const active = new Player('player-1', 'Alice', 'quiz-1');
    const removed = new Player('player-2', 'Bob', 'quiz-1');
    removed.removeFromGame('kicked');

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.listByQuizId.mockResolvedValue([active, removed]);

    const result = await useCase.execute('quiz-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('player-1');
  });

  it('throws when quiz is missing', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Quiz with ID missing not found.'
    );
  });
});
