import { StartQuizUseCase } from '@application/use-cases/start-quiz.use-case';
import { EndQuizUseCase } from '@application/use-cases/end-quiz.use-case';
import type {
  QuizDTO as QuizDTOType,
  QuizTimerDTO as QuizTimerDTOType,
  LeaderboardEntryDTO as LeaderboardEntryDTOType,
} from '@application/dtos/quiz.dto';
import type {
  CreateQuizDTO,
  UpdateQuizDTO,
  QuizListItemDTO,
} from '@application/dtos/quiz-admin.dto';
import type { RoundSummaryDTO } from '@application/dtos/round-summary.dto';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { FindQuizByIdUseCase } from '@application/use-cases/find-quiz-by-id.use-case';
import { GetQuizStateUseCase } from '@application/use-cases/get-quiz-state.use-case';
import {
  AdvanceQuestionUseCase,
  type AdvanceQuestionResult,
} from '@application/use-cases/advance-question.use-case';
import { ResetQuizTimerUseCase } from '@application/use-cases/reset-quiz-timer.use-case';
import { SnapshotLeaderboardUseCase } from '@application/use-cases/snapshot-leaderboard.use-case';
import { LockQuestionUseCase } from '@application/use-cases/lock-question.use-case';
import { CreateQuizUseCase } from '@application/use-cases/create-quiz.use-case';
import { UpdateQuizUseCase } from '@application/use-cases/update-quiz.use-case';
import { DeleteQuizUseCase } from '@application/use-cases/delete-quiz.use-case';
import { ListAllQuizzesUseCase } from '@application/use-cases/list-all-quizzes.use-case';
import { ResetQuizUseCase } from '@application/use-cases/reset-quiz.use-case';

export class QuizService {
  constructor(
    private readonly startQuizUseCase: StartQuizUseCase,
    private readonly endQuizUseCase: EndQuizUseCase,
    private readonly findQuizByIdUseCase: FindQuizByIdUseCase,
    private readonly getQuizStateUseCase: GetQuizStateUseCase,
    private readonly advanceQuestionUseCase: AdvanceQuestionUseCase,
    private readonly resetQuizTimerUseCase: ResetQuizTimerUseCase,
    private readonly snapshotLeaderboardUseCase: SnapshotLeaderboardUseCase,
    private readonly lockQuestionUseCase: LockQuestionUseCase,
    // Admin use cases
    private readonly createQuizUseCase: CreateQuizUseCase,
    private readonly updateQuizUseCase: UpdateQuizUseCase,
    private readonly deleteQuizUseCase: DeleteQuizUseCase,
    private readonly listAllQuizzesUseCase: ListAllQuizzesUseCase,
    private readonly resetQuizUseCase: ResetQuizUseCase
  ) {}

  async startQuiz(quizId: string): Promise<void> {
    await this.startQuizUseCase.execute(quizId);
  }

  async endQuiz(quizId: string): Promise<void> {
    await this.endQuizUseCase.execute(quizId);
  }

  async getQuizDetails(quizId: string): Promise<QuizSessionAggregate | null> {
    return this.findQuizByIdUseCase.execute(quizId);
  }

  async getQuizState(quizId: string): Promise<QuizDTOType> {
    return this.getQuizStateUseCase.execute(quizId);
  }

  async advanceToNextQuestion(quizId: string): Promise<AdvanceQuestionResult> {
    return this.advanceQuestionUseCase.execute(quizId);
  }

  async resetTimer(
    quizId: string,
    durationSeconds?: number
  ): Promise<QuizTimerDTOType> {
    return this.resetQuizTimerUseCase.execute({ quizId, durationSeconds });
  }

  async snapshotLeaderboard(
    quizId: string
  ): Promise<LeaderboardEntryDTOType[]> {
    return this.snapshotLeaderboardUseCase.execute(quizId);
  }

  async lockQuestion(quizId: string): Promise<RoundSummaryDTO> {
    return this.lockQuestionUseCase.execute(quizId);
  }

  // Admin methods
  async createQuiz(data: CreateQuizDTO): Promise<string> {
    return this.createQuizUseCase.execute(data);
  }

  async updateQuiz(quizId: string, data: UpdateQuizDTO): Promise<void> {
    return this.updateQuizUseCase.execute(quizId, data);
  }

  async deleteQuiz(quizId: string): Promise<void> {
    return this.deleteQuizUseCase.execute(quizId);
  }

  async listAllQuizzes(): Promise<QuizListItemDTO[]> {
    return this.listAllQuizzesUseCase.execute();
  }

  async resetQuiz(quizId: string): Promise<void> {
    await this.resetQuizUseCase.execute(quizId);
  }
}
