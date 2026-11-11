import { prisma } from '@infrastructure/database/prisma/client';
import { PrismaPlayerRepository } from '@infrastructure/repositories/prisma-player.repository';
import { PrismaQuizRepository } from '@infrastructure/repositories/prisma-quiz.repository';
import { PrismaQuestionRepository } from '@infrastructure/repositories/prisma-question.repository';
import { PrismaLeaderboardSnapshotRepository } from '@infrastructure/repositories/prisma-leaderboard-snapshot.repository';
import { PrismaAuditLogRepository } from '@infrastructure/repositories/prisma-audit-log.repository';
import { PrismaDatabaseHealthRepository } from '@infrastructure/repositories/prisma-database-health.repository';
import { SupabaseMediaStorage } from '@infrastructure/storage/supabase-media-storage';
import { UploadQuizMediaUseCase } from '@application/use-cases/quiz-media/upload-quiz-media.use-case';
import { DeleteQuizMediaUseCase } from '@application/use-cases/quiz-media/delete-quiz-media.use-case';
import { ListOwnerMediaUseCase } from '@application/use-cases/quiz-media/list-owner-media.use-case';
import { AddPlayerUseCase } from '@application/use-cases/add-player.use-case';
import { FindPlayerByIdUseCase } from '@application/use-cases/find-player-by-id.use-case';
import { ListQuizPlayersUseCase } from '@application/use-cases/list-quiz-players.use-case';
import { UpdatePlayerStatusUseCase } from '@application/use-cases/update-player-status.use-case';
import { UpdatePlayerPresenceUseCase } from '@application/use-cases/update-player-presence.use-case';
import { GetPlayerSessionUseCase } from '@application/use-cases/get-player-session.use-case';
import { GetPlayerConnectionStatusUseCase } from '@application/use-cases/get-player-connection-status.use-case';
import { RemovePlayerUseCase } from '@application/use-cases/remove-player.use-case';
import { PlayerService } from '@application/services/player-service';
import { StartQuizUseCase } from '@application/use-cases/start-quiz.use-case';
import { EndQuizUseCase } from '@application/use-cases/end-quiz.use-case';
import { FindQuizByIdUseCase } from '@application/use-cases/find-quiz-by-id.use-case';
import { GetQuizStateUseCase } from '@application/use-cases/get-quiz-state.use-case';
import { AdvanceQuestionUseCase } from '@application/use-cases/advance-question.use-case';
import { QuizService } from '@application/services/quiz-service';
import { SubmitAnswerUseCase } from '@application/use-cases/submit-answer.use-case';
import { AnswerService } from '@application/services/answer-service';
import { JoinSessionUseCase } from '@application/use-cases/join-session.use-case';
import { ResetQuizTimerUseCase } from '@application/use-cases/reset-quiz-timer.use-case';
import { SnapshotLeaderboardUseCase } from '@application/use-cases/snapshot-leaderboard.use-case';
import { LockQuestionUseCase } from '@application/use-cases/lock-question.use-case';
import { CreateQuizUseCase } from '@application/use-cases/create-quiz.use-case';
import { UpdateQuizUseCase } from '@application/use-cases/update-quiz.use-case';
import { DeleteQuizUseCase } from '@application/use-cases/delete-quiz.use-case';
import { ListQuizzesByOwnerUseCase } from '@application/use-cases/list-quizzes-by-owner.use-case';
import { AssertQuizOwnerUseCase } from '@application/use-cases/assert-quiz-owner.use-case';
import { ResetQuizUseCase } from '@application/use-cases/reset-quiz.use-case';
import { CreateQuestionUseCase } from '@application/use-cases/create-question.use-case';
import { UpdateQuestionUseCase } from '@application/use-cases/update-question.use-case';
import { DeleteQuestionUseCase } from '@application/use-cases/delete-question.use-case';
import { GetQuizQuestionUseCase } from '@application/use-cases/get-quiz-question.use-case';
import { ListQuizQuestionsUseCase } from '@application/use-cases/list-quiz-questions.use-case';
import { ReorderQuestionsUseCase } from '@application/use-cases/reorder-questions.use-case';
import { ListAllQuestionsUseCase } from '@application/use-cases/list-all-questions.use-case';
import { ListAuditLogsUseCase } from '@application/use-cases/audit/list-audit-logs.use-case';
import { PingDatabaseUseCase } from '@application/use-cases/ping-database.use-case';
import type {
  CreateQuestionDTO,
  UpdateQuestionDTO,
  ReorderQuestionsDTO,
} from '@application/dtos/question-admin.dto';

type QuestionService = {
  createQuestion: (
    dto: CreateQuestionDTO
  ) => ReturnType<CreateQuestionUseCase['execute']>;
  updateQuestion: (
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDTO
  ) => ReturnType<UpdateQuestionUseCase['execute']>;
  deleteQuestion: (
    quizId: string,
    questionId: string
  ) => ReturnType<DeleteQuestionUseCase['execute']>;
  getQuizQuestion: (
    quizId: string,
    questionId: string
  ) => ReturnType<GetQuizQuestionUseCase['execute']>;
  listQuizQuestions: (
    quizId: string
  ) => ReturnType<ListQuizQuestionsUseCase['execute']>;
  reorderQuestions: (
    dto: ReorderQuestionsDTO,
    quizId: string
  ) => ReturnType<ReorderQuestionsUseCase['execute']>;
  listAllQuestions: (params: {
    ownerId: string;
    quizId?: string;
    type?: string;
  }) => ReturnType<ListAllQuestionsUseCase['execute']>;
};

type AuditService = {
  listAuditLogs: (params: {
    ownerId: string;
    quizId?: string;
    limit?: number;
  }) => ReturnType<ListAuditLogsUseCase['execute']>;
};

type MediaService = {
  uploadQuizMedia: (
    input: Parameters<UploadQuizMediaUseCase['execute']>[0]
  ) => ReturnType<UploadQuizMediaUseCase['execute']>;
  deleteQuizMedia: (
    input: Parameters<DeleteQuizMediaUseCase['execute']>[0]
  ) => ReturnType<DeleteQuizMediaUseCase['execute']>;
  listOwnerMedia: (
    ownerId: string
  ) => ReturnType<ListOwnerMediaUseCase['execute']>;
};

type ServiceContainer = {
  playerService: PlayerService;
  quizService: QuizService;
  answerService: AnswerService;
  questionService: QuestionService;
  auditService: AuditService;
  mediaService: MediaService;
  joinSessionUseCase: JoinSessionUseCase;
  lockQuestionUseCase: LockQuestionUseCase;
  getPlayerConnectionStatusUseCase: GetPlayerConnectionStatusUseCase;
  pingDatabaseUseCase: PingDatabaseUseCase;
};

let container: ServiceContainer | null = null;

const getRepositories = () => {
  const quizRepository = new PrismaQuizRepository();
  const playerRepository = new PrismaPlayerRepository();
  const questionRepository = new PrismaQuestionRepository();
  const leaderboardSnapshotRepository =
    new PrismaLeaderboardSnapshotRepository();
  const auditLogRepository = new PrismaAuditLogRepository();
  const databaseHealthRepository = new PrismaDatabaseHealthRepository();

  return {
    quizRepository,
    playerRepository,
    questionRepository,
    leaderboardSnapshotRepository,
    auditLogRepository,
    databaseHealthRepository,
  } as const;
};

export const getServices = (): ServiceContainer => {
  if (container) {
    return container;
  }

  const {
    quizRepository,
    playerRepository,
    questionRepository,
    leaderboardSnapshotRepository,
    auditLogRepository,
    databaseHealthRepository,
  } = getRepositories();
  // The only client that writes to the quiz-media bucket (service role)
  const mediaStorage = new SupabaseMediaStorage();

  const addPlayerUseCase = new AddPlayerUseCase(
    quizRepository,
    playerRepository
  );
  const listPlayersUseCase = new ListQuizPlayersUseCase(
    quizRepository,
    playerRepository
  );
  const updatePlayerStatusUseCase = new UpdatePlayerStatusUseCase(
    playerRepository
  );
  const updatePlayerPresenceUseCase = new UpdatePlayerPresenceUseCase(
    playerRepository
  );
  const findPlayerByIdUseCase = new FindPlayerByIdUseCase(playerRepository);
  const getPlayerConnectionStatusUseCase = new GetPlayerConnectionStatusUseCase(
    quizRepository,
    playerRepository
  );
  const getPlayerSessionUseCase = new GetPlayerSessionUseCase(
    quizRepository,
    playerRepository
  );
  const removePlayerUseCase = new RemovePlayerUseCase(playerRepository);

  const playerService = new PlayerService(
    addPlayerUseCase,
    updatePlayerStatusUseCase,
    updatePlayerPresenceUseCase,
    findPlayerByIdUseCase,
    listPlayersUseCase,
    getPlayerSessionUseCase,
    removePlayerUseCase
  );

  const startQuizUseCase = new StartQuizUseCase(
    quizRepository,
    auditLogRepository
  );
  const endQuizUseCase = new EndQuizUseCase(quizRepository);
  const findQuizUseCase = new FindQuizByIdUseCase(quizRepository);
  const getQuizStateUseCase = new GetQuizStateUseCase(
    quizRepository,
    playerRepository
  );
  const advanceQuestionUseCase = new AdvanceQuestionUseCase(
    quizRepository,
    auditLogRepository
  );
  const resetQuizTimerUseCase = new ResetQuizTimerUseCase(quizRepository);
  const snapshotLeaderboardUseCase = new SnapshotLeaderboardUseCase(
    quizRepository
  );
  const lockQuestionUseCase = new LockQuestionUseCase(
    quizRepository,
    playerRepository,
    leaderboardSnapshotRepository,
    auditLogRepository
  );

  // Admin use cases
  const createQuizUseCase = new CreateQuizUseCase(
    quizRepository,
    auditLogRepository
  );
  const updateQuizUseCase = new UpdateQuizUseCase(quizRepository);
  const deleteQuizUseCase = new DeleteQuizUseCase(quizRepository, mediaStorage);
  const resetQuizUseCase = new ResetQuizUseCase(quizRepository);
  const listQuizzesByOwnerUseCase = new ListQuizzesByOwnerUseCase(
    quizRepository
  );
  const assertQuizOwnerUseCase = new AssertQuizOwnerUseCase(quizRepository);

  const quizService = new QuizService(
    startQuizUseCase,
    endQuizUseCase,
    findQuizUseCase,
    getQuizStateUseCase,
    advanceQuestionUseCase,
    resetQuizTimerUseCase,
    snapshotLeaderboardUseCase,
    lockQuestionUseCase,
    createQuizUseCase,
    updateQuizUseCase,
    deleteQuizUseCase,
    resetQuizUseCase,
    listQuizzesByOwnerUseCase,
    assertQuizOwnerUseCase
  );

  const submitAnswerUseCase = new SubmitAnswerUseCase(
    quizRepository,
    playerRepository
  );
  const answerService = new AnswerService(submitAnswerUseCase);

  const joinSessionUseCase = new JoinSessionUseCase(
    quizRepository,
    playerRepository
  );

  // Question service
  const createQuestionUseCase = new CreateQuestionUseCase(
    questionRepository,
    quizRepository,
    mediaStorage
  );
  const updateQuestionUseCase = new UpdateQuestionUseCase(
    questionRepository,
    mediaStorage
  );
  const deleteQuestionUseCase = new DeleteQuestionUseCase(questionRepository);
  const getQuizQuestionUseCase = new GetQuizQuestionUseCase(questionRepository);
  const listQuizQuestionsUseCase = new ListQuizQuestionsUseCase(
    questionRepository
  );
  const reorderQuestionsUseCase = new ReorderQuestionsUseCase(
    questionRepository
  );
  const listAllQuestionsUseCase = new ListAllQuestionsUseCase(
    quizRepository,
    questionRepository
  );

  // Audit use cases
  const listAuditLogsUseCase = new ListAuditLogsUseCase(auditLogRepository);

  const auditService: AuditService = {
    listAuditLogs: (params) => listAuditLogsUseCase.execute(params),
  };

  const questionService: QuestionService = {
    createQuestion: (dto) => createQuestionUseCase.execute(dto),
    updateQuestion: (quizId, questionId, dto) =>
      updateQuestionUseCase.execute(quizId, questionId, dto),
    deleteQuestion: (quizId, questionId) =>
      deleteQuestionUseCase.execute(quizId, questionId),
    getQuizQuestion: (quizId, questionId) =>
      getQuizQuestionUseCase.execute(quizId, questionId),
    listQuizQuestions: (quizId) => listQuizQuestionsUseCase.execute(quizId),
    reorderQuestions: (dto, quizId) =>
      reorderQuestionsUseCase.execute(dto, quizId),
    listAllQuestions: (params) => listAllQuestionsUseCase.execute(params),
  };

  // Media service: the only path that writes to the quiz-media bucket
  const uploadQuizMediaUseCase = new UploadQuizMediaUseCase(
    quizRepository,
    mediaStorage,
    assertQuizOwnerUseCase
  );
  const deleteQuizMediaUseCase = new DeleteQuizMediaUseCase(
    mediaStorage,
    assertQuizOwnerUseCase
  );
  const listOwnerMediaUseCase = new ListOwnerMediaUseCase(
    quizRepository,
    mediaStorage
  );

  const mediaService: MediaService = {
    uploadQuizMedia: (input) => uploadQuizMediaUseCase.execute(input),
    deleteQuizMedia: (input) => deleteQuizMediaUseCase.execute(input),
    listOwnerMedia: (ownerId) => listOwnerMediaUseCase.execute(ownerId),
  };

  container = {
    playerService,
    quizService,
    answerService,
    questionService,
    auditService,
    mediaService,
    joinSessionUseCase,
    lockQuestionUseCase,
    getPlayerConnectionStatusUseCase,
    pingDatabaseUseCase: new PingDatabaseUseCase(databaseHealthRepository),
  };

  return container;
};

type ResetOptions = {
  force?: boolean;
};

export const resetServices = ({ force = false }: ResetOptions = {}) => {
  if (force) {
    container = null;
    prisma.$disconnect().catch(() => {
      // ignore disconnect errors during reset
    });
  }
};
