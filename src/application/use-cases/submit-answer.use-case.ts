import { QuizStatus } from '@domain/entities/quiz';
import { IPlayerRepository } from '@domain/repositories/player-repository';
import { IQuizRepository } from '@domain/repositories/quiz-repository';

export type SubmitAnswerResult = {
  answerId: string;
  isCorrect: boolean | null;
};

export class SubmitAnswerUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository
  ) {}

  async execute(
    quizId: string,
    playerId: string,
    questionId: string,
    answer: string
  ): Promise<SubmitAnswerResult> {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz || quiz.quizStatus !== QuizStatus.Active) {
      throw new Error('Quiz is not active or does not exist.');
    }

    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error('Player not found.');
    }

    // QuizSessionAggregate.submitAnswer handles Answer creation and returns it
    const submittedAnswer = quiz.submitAnswer(playerId, questionId, answer);

    // Refresh presence: answering proves the player is connected
    player.updateLastSeenAt();

    await this.quizRepository.save(quiz);
    await this.playerRepository.save(player);

    return {
      answerId: submittedAnswer.id,
      isCorrect: submittedAnswer.isCorrect ?? null,
    };
  }
}
