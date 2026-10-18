import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Quiz, QuizStatus } from '@domain/entities/quiz';
import { LeaderboardScore } from '@domain/types/leaderboard-score';

export type QuizProgressUpdate = {
  currentQuestionIndex: number;
  activeQuestionId: string | null;
};

export interface IQuizRepository {
  findById(id: string): Promise<QuizSessionAggregate | null>;
  findByJoinCode(joinCode: string): Promise<QuizSessionAggregate | null>;
  listByStatus(status: QuizStatus): Promise<QuizSessionAggregate[]>;
  save(quiz: QuizSessionAggregate): Promise<void>;
  updateCurrentQuestion(
    quizId: string,
    progress: QuizProgressUpdate
  ): Promise<void>;
  updateLeaderboard(
    quizId: string,
    leaderboard: LeaderboardScore[]
  ): Promise<void>;
  /** Sets the lock if the question belongs to the quiz and is not locked yet; true if it set it. */
  lockQuestion(
    quizId: string,
    questionId: string,
    lockedAt: Date
  ): Promise<boolean>;
  /** Clears the lock on every question of the quiz. */
  clearQuestionLocks(quizId: string): Promise<void>;
  delete(id: string): Promise<void>;

  // Admin CRUD operations
  create(quiz: Quiz): Promise<Quiz>;
  update(quiz: Quiz): Promise<void>;
  findAll(): Promise<Quiz[]>;
  findEntityById(id: string): Promise<Quiz | null>;
}
