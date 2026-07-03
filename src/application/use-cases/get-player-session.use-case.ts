import type { PlayerSessionDTO as PlayerSessionDTOType } from '@application/dtos/player-session.dto';
import { mapQuizToDTO } from '@application/mappers/quiz-mapper';
import { mapQuizToPlayerFacingDTO } from '@application/mappers/player-quiz-mapper';
import {
  mapPlayerToDTO,
  buildLeaderboardMeta,
} from '@application/mappers/player-mapper';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import { PlayerStatus, type Player } from '@domain/entities/player';

export class GetPlayerSessionUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(
    quizId: string,
    playerId: string
  ): Promise<PlayerSessionDTOType> {
    const quizAggregate = await this.quizRepository.findById(quizId);
    if (!quizAggregate) {
      throw new Error(`Quiz with ID ${quizId} not found.`);
    }

    if (!quizAggregate.hasPlayer(playerId)) {
      throw new Error(`Player ${playerId} is not part of quiz ${quizId}.`);
    }

    const players = await Promise.all(
      quizAggregate.playerIds.map((id) => this.playerRepository.findById(id))
    );
    const hydratedPlayers = players.filter((player): player is Player =>
      Boolean(player)
    );

    // The roster shown to players excludes Removed players (kicked/timed
    // out), but the requesting player's own session must still resolve even
    // if they were the one removed, so this filter is scoped to the DTO's
    // player list rather than applied to `hydratedPlayers` itself.
    const rosterPlayers = hydratedPlayers.filter(
      (player) => player.status !== PlayerStatus.Removed
    );

    const quizDto = mapQuizToPlayerFacingDTO(
      mapQuizToDTO(quizAggregate, rosterPlayers)
    );

    const targetPlayer = hydratedPlayers.find(
      (player) => player.id === playerId
    );
    if (!targetPlayer) {
      throw new Error(`Player with ID ${playerId} not found.`);
    }

    const leaderboardMeta = buildLeaderboardMeta(
      quizAggregate.getLeaderboard()
    );
    const playerDto = mapPlayerToDTO(targetPlayer, leaderboardMeta);

    return {
      quiz: quizDto,
      player: playerDto,
    };
  }
}
