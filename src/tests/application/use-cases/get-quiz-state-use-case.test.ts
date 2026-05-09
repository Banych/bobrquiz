import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { GetQuizStateUseCase } from '@application/use-cases/get-quiz-state.use-case';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { IPlayerRepository } from '@domain/repositories/player-repository';
import { Quiz } from '@domain/entities/quiz';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Player } from '@domain/entities/player';
import { Question } from '@domain/entities/question';

describe('GetQuizStateUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let useCase: GetQuizStateUseCase;

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

    useCase = new GetQuizStateUseCase(quizRepository, playerRepository);
  });

  it('returns a hydrated quiz DTO', async () => {
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

    const player = new Player('player-1', 'Alice', 'quiz-1');

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.findById.mockResolvedValue(player);

    const dto = await useCase.execute('quiz-1');

    expect(dto.id).toBe('quiz-1');
    expect(dto.players).toHaveLength(1);
    expect(dto.players[0]).toMatchObject({ id: 'player-1', name: 'Alice' });
    expect(dto.questions[0].id).toBe('q-1');
    expect(quizRepository.findById).toHaveBeenCalledWith('quiz-1');
  });

  it('throws when quiz is missing', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toThrow(
      'Quiz with ID missing not found.'
    );
  });

  it('excludes Removed players from the returned DTO', async () => {
    const quiz = new Quiz('quiz-1', 'General Knowledge', [], {
      allowSkipping: false,
      timePerQuestion: 30,
    });
    const aggregate = new QuizSessionAggregate(quiz, 30);
    aggregate.addPlayer('player-active');
    aggregate.addPlayer('player-removed');

    const activePlayer = new Player('player-active', 'Alice', 'quiz-1');
    const removedPlayer = new Player('player-removed', 'Bob', 'quiz-1');
    removedPlayer.removeFromGame('kicked');

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.findById
      .mockResolvedValueOnce(activePlayer)
      .mockResolvedValueOnce(removedPlayer);

    const dto = await useCase.execute('quiz-1');

    expect(dto.players).toHaveLength(1);
    expect(dto.players[0]).toMatchObject({
      id: 'player-active',
      name: 'Alice',
    });
    expect(dto.players.find((p) => p.id === 'player-removed')).toBeUndefined();
  });
});
