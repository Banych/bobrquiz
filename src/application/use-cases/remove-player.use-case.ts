import type { IPlayerRepository } from '@domain/repositories/player-repository';

export class RemovePlayerUseCase {
  constructor(private readonly playerRepository: IPlayerRepository) {}

  async execute(
    playerId: string,
    quizId: string,
    reason: 'kicked' | 'timeout'
  ): Promise<{
    playerId: string;
    quizId: string;
    reason: 'kicked' | 'timeout';
  }> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found.`);
    }
    if (player.quizId !== quizId) {
      throw new Error(`Player with ID ${playerId} not found.`);
    }
    player.removeFromGame(reason);
    await this.playerRepository.save(player);
    return { playerId, quizId, reason };
  }
}
