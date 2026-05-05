import { IPlayerRepository } from '@domain/repositories/player-repository';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { Player, PlayerStatus } from '@domain/entities/player';

export class AddPlayerUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(
    quizId: string,
    playerId: string,
    playerName: string
  ): Promise<void> {
    const quizSession = await this.quizRepository.findById(quizId);
    if (!quizSession) {
      throw new Error('Quiz not found.');
    }

    const existingPlayer = await this.playerRepository.findById(playerId);
    if (existingPlayer) {
      throw new Error('Player already exists.');
    }

    const duplicateName = await this.playerRepository.findByQuizIdAndName(
      quizId,
      playerName
    );
    if (duplicateName && duplicateName.status !== PlayerStatus.Removed) {
      throw new Error('Player name already taken for this quiz.');
    }

    const newPlayer = new Player(playerId, playerName, quizId);
    quizSession.addPlayer(newPlayer.id);

    await this.playerRepository.save(newPlayer);
    await this.quizRepository.save(quizSession);
  }
}
