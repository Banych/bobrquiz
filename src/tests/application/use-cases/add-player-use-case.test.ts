import { AddPlayerUseCase } from '@application/use-cases/add-player.use-case';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Quiz } from '@domain/entities/quiz';
import { Player, PlayerStatus } from '@domain/entities/player';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { IPlayerRepository } from '@domain/repositories/player-repository';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('AddPlayerUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let addPlayerUseCase: AddPlayerUseCase;

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
    addPlayerUseCase = new AddPlayerUseCase(quizRepository, playerRepository);
  });

  it('should add a player to the quiz', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.findById.mockResolvedValue(null);
    playerRepository.findByQuizIdAndName.mockResolvedValue(null);

    await addPlayerUseCase.execute('quiz1', 'p1', 'Player 1');

    expect(quizRepository.findById).toHaveBeenCalledWith('quiz1');
    expect(playerRepository.findById).toHaveBeenCalledWith('p1');
    expect(playerRepository.findByQuizIdAndName).toHaveBeenCalledWith(
      'quiz1',
      'Player 1'
    );
    expect(quiz.hasPlayer('p1')).toBe(true);
    expect(playerRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Player 1' })
    );
    expect(quizRepository.save).toHaveBeenCalledWith(quiz);
  });

  it('should throw an error if the player already exists', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.findById.mockResolvedValue(
      new Player('p1', 'Player 1', 'quiz1')
    );

    await expect(
      addPlayerUseCase.execute('quiz1', 'p1', 'Player 1')
    ).rejects.toThrow('Player already exists.');
    expect(playerRepository.save).not.toHaveBeenCalled();
    expect(quizRepository.save).not.toHaveBeenCalled();
  });

  it('should throw an error if the player name is taken within the quiz', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.findById.mockResolvedValue(null);
    playerRepository.findByQuizIdAndName.mockResolvedValue(
      new Player('existing', 'Player 1', 'quiz1')
    );

    await expect(
      addPlayerUseCase.execute('quiz1', 'p2', 'Player 1')
    ).rejects.toThrow('Player name already taken for this quiz.');
    expect(playerRepository.save).not.toHaveBeenCalled();
    expect(quizRepository.save).not.toHaveBeenCalled();
  });

  it('should allow rejoin when existing player with same name is Removed', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );
    const removedPlayer = new Player('old-p', 'Player 1', 'quiz1');
    removedPlayer.status = PlayerStatus.Removed;

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.findById.mockResolvedValue(null);
    playerRepository.findByQuizIdAndName.mockResolvedValue(removedPlayer);

    await expect(
      addPlayerUseCase.execute('quiz1', 'p2', 'Player 1')
    ).resolves.toBeUndefined();
    expect(playerRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p2', name: 'Player 1' })
    );
  });
});
