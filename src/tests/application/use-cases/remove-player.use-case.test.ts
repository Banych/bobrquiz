import { RemovePlayerUseCase } from '@application/use-cases/remove-player.use-case';
import { Player, PlayerStatus } from '@domain/entities/player';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

describe('RemovePlayerUseCase', () => {
  let playerRepository: Mocked<IPlayerRepository>;
  let useCase: RemovePlayerUseCase;

  beforeEach(() => {
    playerRepository = {
      findById: vi.fn(),
      listByQuizId: vi.fn(),
      findByQuizIdAndName: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateScore: vi.fn(),
      updateLastSeenAt: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IPlayerRepository>;
    useCase = new RemovePlayerUseCase(playerRepository);
  });

  it('should mark player as Removed and return result for reason "kicked"', async () => {
    const player = new Player('p1', 'Alice', 'quiz1');
    playerRepository.findById.mockResolvedValue(player);
    playerRepository.save.mockResolvedValue(undefined);

    const result = await useCase.execute('p1', 'quiz1', 'kicked');

    expect(player.status).toBe(PlayerStatus.Removed);
    expect(playerRepository.save).toHaveBeenCalledWith(player);
    expect(result).toEqual({
      playerId: 'p1',
      quizId: 'quiz1',
      reason: 'kicked',
    });
  });

  it('should mark player as Removed and return result for reason "timeout"', async () => {
    const player = new Player('p1', 'Alice', 'quiz1');
    playerRepository.findById.mockResolvedValue(player);
    playerRepository.save.mockResolvedValue(undefined);

    const result = await useCase.execute('p1', 'quiz1', 'timeout');

    expect(player.status).toBe(PlayerStatus.Removed);
    expect(playerRepository.save).toHaveBeenCalledWith(player);
    expect(result).toEqual({
      playerId: 'p1',
      quizId: 'quiz1',
      reason: 'timeout',
    });
  });

  it('should throw when player is not found', async () => {
    playerRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('p1', 'quiz1', 'kicked')).rejects.toThrow(
      'Player with ID p1 not found.'
    );
    expect(playerRepository.save).not.toHaveBeenCalled();
  });

  it('should throw when player belongs to a different quiz', async () => {
    const player = new Player('p1', 'Alice', 'other-quiz');
    playerRepository.findById.mockResolvedValue(player);

    await expect(useCase.execute('p1', 'quiz1', 'kicked')).rejects.toThrow(
      'Player with ID p1 not found.'
    );
    expect(playerRepository.save).not.toHaveBeenCalled();
  });

  it('should throw when player is already Removed', async () => {
    const player = new Player('p1', 'Alice', 'quiz1');
    player.removeFromGame('kicked'); // set to Removed first
    playerRepository.findById.mockResolvedValue(player);

    await expect(useCase.execute('p1', 'quiz1', 'kicked')).rejects.toThrow(
      'Player has already been removed from the game.'
    );
    expect(playerRepository.save).not.toHaveBeenCalled();
  });
});
