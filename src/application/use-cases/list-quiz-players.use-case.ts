import type { PlayerDTO as PlayerDTOType } from '@application/dtos/player.dto';
import {
  mapPlayerToDTO,
  buildLeaderboardMeta,
} from '@application/mappers/player-mapper';
import { PlayerStatus } from '@domain/entities/player';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';

export class ListQuizPlayersUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(quizId: string): Promise<PlayerDTOType[]> {
    const quizAggregate = await this.quizRepository.findById(quizId);
    if (!quizAggregate) {
      throw new Error(`Quiz with ID ${quizId} not found.`);
    }

    const players = await this.playerRepository.listByQuizId(quizId);
    const activePlayers = players.filter(
      (player) => player.status !== PlayerStatus.Removed
    );
    const leaderboardMeta = buildLeaderboardMeta(
      quizAggregate.getLeaderboard()
    );

    return activePlayers.map((player) =>
      mapPlayerToDTO(player, leaderboardMeta)
    );
  }
}
