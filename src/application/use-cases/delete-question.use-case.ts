import type { IQuestionRepository } from '@domain/repositories/question-repository';
import { loadQuizQuestion } from '@application/use-cases/get-quiz-question.use-case';

/**
 * Use case: Delete a question
 * Business rules:
 * - Question must exist and belong to the given quiz (otherwise not found)
 * - Deleting a question doesn't reorder remaining questions (gaps in orderIndex are acceptable)
 * - Cascade deletes handled by Prisma schema (answers deleted automatically)
 */
export class DeleteQuestionUseCase {
  constructor(private readonly questionRepository: IQuestionRepository) {}

  async execute(quizId: string, questionId: string): Promise<void> {
    await loadQuizQuestion(this.questionRepository, quizId, questionId);

    // Delete
    await this.questionRepository.delete(questionId);
  }
}
