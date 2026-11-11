import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { IMediaStorage } from '@domain/repositories/media-storage';
import type { UpdateQuestionDTO } from '@application/dtos/question-admin.dto';
import type { Question } from '@domain/entities/question';
import { loadQuizQuestion } from '@application/use-cases/get-quiz-question.use-case';
import { assertQuizMediaUrl } from '@application/use-cases/quiz-media/assert-quiz-media-url';

/**
 * Use case: Update an existing question
 * Business rules:
 * - Question must exist and belong to the given quiz (otherwise not found)
 * - Type changes clear incompatible fields:
 *   - multiple-choice → text: Keep options, clear correctAnswers (admin must re-enter)
 *   - text → multiple-choice: Clear options (admin must add new), clear correctAnswers
 *   - any → true/false: Set options to ['True', 'False'], clear correctAnswers
 * - Partial updates: only provided fields are changed
 * - A new image must be a file uploaded to this quiz's own media folder; an
 *   unchanged image saved before that rule is kept
 */
export class UpdateQuestionUseCase {
  constructor(
    private readonly questionRepository: IQuestionRepository,
    private readonly mediaStorage: IMediaStorage
  ) {}

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

    if (dto.mediaUrl && dto.mediaUrl !== question.media) {
      assertQuizMediaUrl(this.mediaStorage, quizId, dto.mediaUrl);
    }

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
