import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { ReorderQuestionsDTO } from '@application/dtos/question-admin.dto';
import { loadQuizQuestion } from '@application/use-cases/get-quiz-question.use-case';

/**
 * Use case: Reorder questions via drag-drop
 * Business rules:
 * - All question IDs must exist and belong to the given quiz; a question from
 *   another quiz gets the same not-found error as a missing one
 * - Updates orderIndex for all provided questions atomically
 * - Repository handles transaction to ensure consistency
 */
export class ReorderQuestionsUseCase {
  constructor(private readonly questionRepository: IQuestionRepository) {}

  async execute(dto: ReorderQuestionsDTO, quizId: string): Promise<void> {
    if (dto.questions.length === 0) {
      return; // Nothing to reorder
    }

    for (const { id } of dto.questions) {
      await loadQuizQuestion(this.questionRepository, quizId, id);
    }

    // Update order via repository (handles transaction)
    // Map DTO to repository format (id -> questionId)
    const orderUpdates = dto.questions.map((q) => ({
      questionId: q.id,
      orderIndex: q.orderIndex,
    }));

    await this.questionRepository.updateOrder(orderUpdates);
  }
}
