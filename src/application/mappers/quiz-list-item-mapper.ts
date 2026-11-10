import type { QuizListItemDTO } from '@application/dtos/quiz-admin.dto';
import type { Quiz } from '@domain/entities/quiz';

export const toQuizListItemDTO = (quiz: Quiz): QuizListItemDTO => ({
  id: quiz.id,
  title: quiz.title,
  status: quiz.status,
  questionCount: quiz.questions.length,
  playerCount: quiz.players.size,
  timePerQuestion: quiz.settings.timePerQuestion,
  allowSkipping: quiz.settings.allowSkipping,
  scoringAlgorithm: quiz.settings.scoringAlgorithm || 'EXPONENTIAL_DECAY',
  scoringDecayRate: quiz.settings.scoringDecayRate ?? null,
  joinCode: quiz.joinCode || null,
  createdAt: new Date().toISOString(), // Will be populated from DB
  updatedAt: new Date().toISOString(), // Will be populated from DB
});
