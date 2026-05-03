import { IQuizRepository } from '@domain/repositories/quiz-repository';

export class ResetQuizUseCase {
  constructor(private readonly quizRepository: IQuizRepository) {}

  async execute(quizId: string): Promise<void> {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found.');
    }
    quiz.reset();
    await this.quizRepository.save(quiz);
  }
}
