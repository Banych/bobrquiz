import { PresenceMonitor } from '@application/services/presence-monitor';
import {
  type PlayerConnectionStatusDTO,
  PlayerConnectionStatusSchema,
} from '@application/dtos/player-connection-status.dto';
import { mapPlayerToDTO } from '@application/mappers/player-mapper';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import { PlayerStatus } from '@domain/entities/player';

/**
 * GetPlayerConnectionStatusUseCase
 *
 * Orchestrates retrieving player connection status for a specific quiz.
 * Returns a list of players with their current connection status based on
 * when they were last seen (lastSeenAt timestamp).
 *
 * Usage:
 * - Host dashboard: Display which players are connected/idle/disconnected
 * - Connection monitoring: Track player health during quiz sessions
 * - Reconnection flow: Identify which players need to reconnect
 */
export class GetPlayerConnectionStatusUseCase {
  private readonly presenceMonitor = new PresenceMonitor();

  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(
    quizId: string,
    now: Date = new Date()
  ): Promise<PlayerConnectionStatusDTO[]> {
    // Verify quiz exists
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error(`Quiz with ID ${quizId} not found.`);
    }

    // Fetch all players for this quiz, excluding Removed ones
    const players = await this.playerRepository.listByQuizId(quizId);
    const activePlayers = players.filter(
      (p) => p.status !== PlayerStatus.Removed
    );
    if (activePlayers.length === 0) {
      return [];
    }

    // Map to DTOs with connection status
    const playerDTOs = activePlayers.map((player) =>
      mapPlayerToDTO(player, {
        includeConnectionStatus: true,
        now,
      })
    );

    // Aggregate connection status for each player
    const statuses = this.presenceMonitor.aggregatePlayerStatus(
      playerDTOs,
      now
    );

    // Build response with connection status
    const result: PlayerConnectionStatusDTO[] = playerDTOs.map((dto) => {
      const connectionStatus = statuses.get(dto.id);
      if (!connectionStatus) {
        throw new Error(
          `Failed to determine connection status for player ${dto.id}`
        );
      }

      const item = {
        playerId: dto.id,
        name: dto.name,
        connectionStatus,
        lastSeenAt: dto.lastSeenAt,
      };

      // Validate against schema
      return PlayerConnectionStatusSchema.parse(item);
    });

    return result;
  }
}
