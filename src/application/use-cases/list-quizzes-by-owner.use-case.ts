import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { QuizListItemDTO } from '@application/dtos/quiz-admin.dto';
import { toQuizListItemDTO } from '@application/mappers/quiz-list-item-mapper';

export class ListQuizzesByOwnerUseCase {
  constructor(private readonly quizRepository: IQuizRepository) {}

  async execute(ownerId: string): Promise<QuizListItemDTO[]> {
    const quizzes = await this.quizRepository.listByOwner(ownerId);

    return quizzes.map(toQuizListItemDTO);
  }
}
