import type { IQuizRepository } from '@domain/repositories/quiz-repository';

/**
 * Owner guard. A missing quiz and a quiz owned by someone else throw the same
 * not-found error, so callers cannot tell them apart.
 */
export class AssertQuizOwnerUseCase {
  constructor(private readonly quizRepository: IQuizRepository) {}

  async execute(quizId: string, ownerId: string): Promise<void> {
    const quiz = await this.quizRepository.findEntityById(quizId);

    if (!quiz || quiz.ownerId !== ownerId) {
      throw new Error(`Quiz with ID ${quizId} not found`);
    }
  }
}
