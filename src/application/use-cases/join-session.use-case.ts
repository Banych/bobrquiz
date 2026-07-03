import type { QuizDTO as QuizDTOType } from '@application/dtos/quiz.dto';
import { mapQuizToDTO } from '@application/mappers/quiz-mapper';
import { mapQuizToPlayerFacingDTO } from '@application/mappers/player-quiz-mapper';
import type { Player } from '@domain/entities/player';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';

export class JoinSessionUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(joinCode: string): Promise<QuizDTOType> {
    if (!joinCode) {
      throw new Error('Join code is required.');
    }

    const quizAggregate = await this.quizRepository.findByJoinCode(joinCode);
    if (!quizAggregate) {
      throw new Error('Quiz with the provided join code was not found.');
    }

    const players = await Promise.all(
      quizAggregate.playerIds.map((playerId) =>
        this.playerRepository.findById(playerId)
      )
    );

    const hydratedPlayers = players.filter((player): player is Player =>
      Boolean(player)
    );

    return mapQuizToPlayerFacingDTO(
      mapQuizToDTO(quizAggregate, hydratedPlayers)
    );
  }
}
