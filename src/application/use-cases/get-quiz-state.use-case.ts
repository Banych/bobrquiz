import type { QuizDTO as QuizDTOType } from '@application/dtos/quiz.dto';
import { mapQuizToDTO } from '@application/mappers/quiz-mapper';
import type { Player } from '@domain/entities/player';
import { PlayerStatus } from '@domain/entities/player';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';

export class GetQuizStateUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(quizId: string): Promise<QuizDTOType> {
    const quizAggregate = await this.quizRepository.findById(quizId);
    if (!quizAggregate) {
      throw new Error(`Quiz with ID ${quizId} not found.`);
    }

    const players = await Promise.all(
      quizAggregate.playerIds.map((playerId) =>
        this.playerRepository.findById(playerId)
      )
    );

    const hydratedPlayers = players.filter(
      (player): player is Player =>
        !!player && player.status !== PlayerStatus.Removed
    );

    return mapQuizToDTO(quizAggregate, hydratedPlayers);
  }
}
