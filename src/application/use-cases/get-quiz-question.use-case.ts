import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { Question } from '@domain/entities/question';

/**
 * Loads a question only through the quiz it belongs to. A missing question and
 * a question from another quiz throw the same not-found error, so a caller
 * cannot learn that a question id exists elsewhere.
 */
export const loadQuizQuestion = async (
  questionRepository: IQuestionRepository,
  quizId: string,
  questionId: string
): Promise<Question> => {
  const question = await questionRepository.findById(questionId);

  if (!question || question.quizId !== quizId) {
    throw new Error(`Question not found: ${questionId}`);
  }

  return question;
};

export class GetQuizQuestionUseCase {
  constructor(private readonly questionRepository: IQuestionRepository) {}

  execute(quizId: string, questionId: string): Promise<Question> {
    return loadQuizQuestion(this.questionRepository, quizId, questionId);
  }
}
