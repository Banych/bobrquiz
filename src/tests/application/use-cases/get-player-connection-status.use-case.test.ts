import { GetPlayerConnectionStatusUseCase } from '@application/use-cases/get-player-connection-status.use-case';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import { Player, PlayerStatus } from '@domain/entities/player';
import { Quiz } from '@domain/entities/quiz';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('GetPlayerConnectionStatusUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let useCase: GetPlayerConnectionStatusUseCase;
  const baseTime = new Date('2026-01-27T12:00:00Z');

  beforeEach(() => {
    quizRepository = {
      findById: vi.fn(),
      save: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IQuizRepository>;

    playerRepository = {
      findById: vi.fn(),
      save: vi.fn(),
      listByQuizId: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IPlayerRepository>;

    useCase = new GetPlayerConnectionStatusUseCase(
      quizRepository,
      playerRepository
    );
  });

  describe('execute', () => {
    it('should return empty array when quiz has no players', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([]);

      const result = await useCase.execute(quizId, baseTime);

      expect(result).toEqual([]);
      expect(quizRepository.findById).toHaveBeenCalledWith(quizId);
      expect(playerRepository.listByQuizId).toHaveBeenCalledWith(quizId);
    });

    it('should throw error when quiz is not found', async () => {
      const quizId = 'quiz-not-found';

      quizRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(quizId, baseTime)).rejects.toThrow(
        `Quiz with ID ${quizId} not found.`
      );
    });

    it('should return all connected players when lastSeenAt is recent', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const player1 = new Player('p1', 'Player 1', quizId);
      player1.lastSeenAt = new Date(baseTime.getTime() - 5_000); // 5s ago = connected

      const player2 = new Player('p2', 'Player 2', quizId);
      player2.lastSeenAt = new Date(baseTime.getTime() - 10_000); // 10s ago = connected

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([player1, player2]);

      const result = await useCase.execute(quizId, baseTime);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        playerId: 'p1',
        name: 'Player 1',
        connectionStatus: 'connected',
      });
      expect(result[1]).toMatchObject({
        playerId: 'p2',
        name: 'Player 2',
        connectionStatus: 'connected',
      });
    });

    it('should return mixed status when players have different lastSeenAt times', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const player1 = new Player('p1', 'Player 1', quizId);
      player1.lastSeenAt = new Date(baseTime.getTime() - 5_000); // 5s ago = connected

      const player2 = new Player('p2', 'Player 2', quizId);
      player2.lastSeenAt = new Date(baseTime.getTime() - 60_000); // 60s ago = away

      const player3 = new Player('p3', 'Player 3', quizId);
      player3.lastSeenAt = new Date(baseTime.getTime() - 150_000); // 150s ago = disconnected

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([
        player1,
        player2,
        player3,
      ]);

      const result = await useCase.execute(quizId, baseTime);

      expect(result).toHaveLength(3);
      expect(result[0].connectionStatus).toBe('connected');
      expect(result[1].connectionStatus).toBe('away');
      expect(result[2].connectionStatus).toBe('disconnected');
    });

    it('should return disconnected for players with null lastSeenAt', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const player = new Player('p1', 'Player 1', quizId);
      player.lastSeenAt = null;

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([player]);

      const result = await useCase.execute(quizId, baseTime);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        playerId: 'p1',
        connectionStatus: 'disconnected',
        lastSeenAt: null,
      });
    });

    it('should use current time when now is not provided', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const player = new Player('p1', 'Player 1', quizId);
      player.lastSeenAt = new Date(Date.now() - 5_000); // 5s ago = connected

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([player]);

      const result = await useCase.execute(quizId);

      expect(result).toHaveLength(1);
      expect(result[0].connectionStatus).toBe('connected');
    });

    it('should include lastSeenAt timestamp in response', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const lastSeenTime = new Date(baseTime.getTime() - 5_000);
      const player = new Player('p1', 'Player 1', quizId);
      player.lastSeenAt = lastSeenTime;

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([player]);

      const result = await useCase.execute(quizId, baseTime);

      expect(result[0].lastSeenAt).toBe(lastSeenTime.toISOString());
    });

    it('should handle multiple players correctly', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const players = Array.from({ length: 10 }, (_, i) => {
        const player = new Player(`p${i}`, `Player ${i}`, quizId);
        player.lastSeenAt = new Date(
          baseTime.getTime() - i * 15_000 // Stagger by 15 seconds
        );
        return player;
      });

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue(players);

      const result = await useCase.execute(quizId, baseTime);

      expect(result).toHaveLength(10);
      // Players 0-2 connected (0, 15, 30 seconds)
      // Players 3-8 away (45, 60, 75, 90, 105, 120 seconds)
      // Players 9 disconnected (135 seconds)
      expect(result[0].connectionStatus).toBe('connected');
      expect(result[2].connectionStatus).toBe('connected');
      expect(result[3].connectionStatus).toBe('away');
      expect(result[8].connectionStatus).toBe('away');
      expect(result[9].connectionStatus).toBe('disconnected');
    });

    it('should exclude Removed players from the result', async () => {
      const quizId = 'quiz-1';
      const quiz = new Quiz(quizId, 'Test Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      });
      const quizAggregate = new QuizSessionAggregate(quiz, 30);

      const activePlayer = new Player('p1', 'Active Player', quizId);
      activePlayer.lastSeenAt = new Date(baseTime.getTime() - 5_000);

      const removedPlayer = new Player('p2', 'Removed Player', quizId);
      removedPlayer.lastSeenAt = new Date(baseTime.getTime() - 5_000);
      removedPlayer.status = PlayerStatus.Removed;

      quizRepository.findById.mockResolvedValue(quizAggregate);
      playerRepository.listByQuizId.mockResolvedValue([
        activePlayer,
        removedPlayer,
      ]);

      const result = await useCase.execute(quizId, baseTime);

      expect(result).toHaveLength(1);
      expect(result[0].playerId).toBe('p1');
    });
  });
});
