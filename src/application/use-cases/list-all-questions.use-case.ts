import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { QuestionListItemDTO } from '@application/dtos/question-admin.dto';

export class ListAllQuestionsUseCase {
  constructor(
    private readonly quizRepo: IQuizRepository,
    private readonly questionRepo: IQuestionRepository
  ) {}

  /**
   * Questions across the owner's quizzes only. The quizId and type filters
   * apply inside that set: another owner's quizId gives an empty list.
   */
  async execute(params: {
    ownerId: string;
    quizId?: string;
    type?: string;
  }): Promise<QuestionListItemDTO[]> {
    const { ownerId, quizId, type } = params;

    const quizzes = (await this.quizRepo.listByOwner(ownerId)).filter(
      (quiz) => !quizId || quiz.id === quizId
    );

    const allResults = await Promise.all(
      quizzes.map(async (quiz) => {
        const questions = await this.questionRepo.listByQuizId(quiz.id);
        return questions
          .filter((q) => !type || q.type === type)
          .map((q) => ({
            id: q.id,
            text: q.text,
            type: q.type,
            points: q.points,
            orderIndex: q.orderIndex ?? 0,
            hasCorrectAnswers: q.correctAnswers.length > 0,
            mediaUrl: q.media ?? null,
            quizId: quiz.id,
            quizTitle: quiz.title,
          }));
      })
    );

    return allResults.flat();
  }
}
