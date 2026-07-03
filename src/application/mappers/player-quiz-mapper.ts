import type { QuizDTO as QuizDTOType } from '@application/dtos/quiz.dto';
import type { QuestionDTO as QuestionDTOType } from '@application/dtos/question.dto';

const redactQuestion = (question: QuestionDTOType): QuestionDTOType => ({
  id: question.id,
  text: '',
  media: undefined,
  mediaType: undefined,
  options: undefined,
  type: question.type,
  points: question.points,
  orderIndex: question.orderIndex,
  answersLockedAt: question.answersLockedAt,
});

/**
 * Redacts quiz state before it reaches a player's browser: unrevealed
 * questions lose their content (only the active question keeps
 * text/media/options), and cross-player answers are stripped entirely.
 * Array length and question ids are preserved so player-facing components
 * relying on `questions.length` / `.find(id)` keep working unchanged.
 */
export const mapQuizToPlayerFacingDTO = (quiz: QuizDTOType): QuizDTOType => ({
  ...quiz,
  questions: quiz.questions.map((question) =>
    question.id === quiz.activeQuestionId ? question : redactQuestion(question)
  ),
  answers: undefined,
});
