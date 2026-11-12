import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IMediaStorage } from '@domain/repositories/media-storage';
import { Question } from '@domain/entities/question';
import type { CreateQuestionDTO } from '@application/dtos/question-admin.dto';
import { assertQuizMediaUrl } from '@application/use-cases/quiz-media/assert-quiz-media-url';
import { randomUUID } from 'crypto';

/**
 * Use case: Create a new question for a quiz
 * Business rules:
 * - Quiz must exist
 * - Question is appended to end of quiz (max orderIndex + 1)
 * - For multiple-choice: options array required, correctAnswers must reference option values
 * - For true/false: options auto-set to ['True', 'False']
 * - For text: options empty, correctAnswers are text variants (case-insensitive matching)
 * - An image must be a file uploaded to this quiz's own media folder
 */
export class CreateQuestionUseCase {
  constructor(
    private readonly questionRepository: IQuestionRepository,
    private readonly quizRepository: IQuizRepository,
    private readonly mediaStorage: IMediaStorage
  ) {}

  async execute(dto: CreateQuestionDTO): Promise<Question> {
    // Verify quiz exists
    const quiz = await this.quizRepository.findById(dto.quizId);
    if (!quiz) {
      throw new Error(`Quiz not found: ${dto.quizId}`);
    }

    if (dto.mediaUrl) {
      assertQuizMediaUrl(this.mediaStorage, dto.quizId, dto.mediaUrl);
    }

    // Get existing questions to calculate orderIndex
    const existingQuestions = await this.questionRepository.listByQuizId(
      dto.quizId
    );
    const maxOrderIndex = existingQuestions.reduce(
      (max, q) => Math.max(max, q.orderIndex ?? 0),
      -1
    );

    // Handle type-specific defaults
    let options = dto.options;
    if (dto.type === 'true/false') {
      options = ['True', 'False'];
    }

    // Create question entity
    const question = new Question(
      randomUUID(),
      dto.text,
      dto.correctAnswers,
      dto.type,
      dto.points,
      dto.mediaUrl ?? undefined,
      dto.mediaType ?? undefined,
      options
    );

    question.quizId = dto.quizId;
    question.orderIndex = maxOrderIndex + 1;
    question.isPublished = false; // New questions start unpublished

    // Persist
    await this.questionRepository.save(question);

    return question;
  }
}
