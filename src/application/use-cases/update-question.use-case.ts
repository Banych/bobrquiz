import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { UpdateQuestionDTO } from '@application/dtos/question-admin.dto';
import type { Question } from '@domain/entities/question';
import { loadQuizQuestion } from '@application/use-cases/get-quiz-question.use-case';

/**
 * Use case: Update an existing question
 * Business rules:
 * - Question must exist and belong to the given quiz (otherwise not found)
 * - Type changes clear incompatible fields:
 *   - multiple-choice → text: Keep options, clear correctAnswers (admin must re-enter)
 *   - text → multiple-choice: Clear options (admin must add new), clear correctAnswers
 *   - any → true/false: Set options to ['True', 'False'], clear correctAnswers
 * - Partial updates: only provided fields are changed
 */
export class UpdateQuestionUseCase {
  constructor(private readonly questionRepository: IQuestionRepository) {}

  async execute(
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDTO
  ): Promise<Question> {
    const question = await loadQuizQuestion(
      this.questionRepository,
      quizId,
      questionId
    );

    const originalType = question.type;
    const newType = dto.type ?? originalType;

    // Handle type change side effects
    if (dto.type && dto.type !== originalType) {
      if (newType === 'true/false') {
        // Switching to true/false: force binary options, clear answers
        question.options = ['True', 'False'];
        question.correctAnswers = [];
      } else if (originalType === 'multiple-choice' && newType === 'text') {
        // MC → Text: Clear correctAnswers (free-form now), keep options as reference
        question.correctAnswers = [];
      } else if (originalType === 'text' && newType === 'multiple-choice') {
        // Text → MC: Clear both (admin must rebuild)
        question.options = [];
        question.correctAnswers = [];
      } else {
        // Other transitions: clear both to force rebuild
        question.options = [];
        question.correctAnswers = [];
      }
      question.type = newType;
    }

    // Apply field updates (override type-change defaults if explicitly provided)
    if (dto.text !== undefined) {
      question.text = dto.text;
    }
    if (dto.options !== undefined) {
      question.options = dto.options;
    }
    if (dto.correctAnswers !== undefined) {
      question.correctAnswers = dto.correctAnswers;
    }
    if (dto.points !== undefined) {
      question.points = dto.points;
    }
    if (dto.mediaUrl !== undefined) {
      question.media = dto.mediaUrl ?? undefined;
    }
    if (dto.mediaType !== undefined) {
      question.mediaType = dto.mediaType ?? undefined;
    }

    // Persist
    await this.questionRepository.save(question);

    return question;
  }
}
