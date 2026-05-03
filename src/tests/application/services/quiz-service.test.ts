import { QuizService } from '@application/services/quiz-service';
import { StartQuizUseCase } from '@application/use-cases/start-quiz.use-case';
import { EndQuizUseCase } from '@application/use-cases/end-quiz.use-case';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { FindQuizByIdUseCase } from '@application/use-cases/find-quiz-by-id.use-case';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Quiz } from '@domain/entities/quiz';
import { GetQuizStateUseCase } from '@application/use-cases/get-quiz-state.use-case';
import { AdvanceQuestionUseCase } from '@application/use-cases/advance-question.use-case';
import { ResetQuizTimerUseCase } from '@application/use-cases/reset-quiz-timer.use-case';
import { SnapshotLeaderboardUseCase } from '@application/use-cases/snapshot-leaderboard.use-case';
import { LockQuestionUseCase } from '@application/use-cases/lock-question.use-case';
import { CreateQuizUseCase } from '@application/use-cases/create-quiz.use-case';
import { UpdateQuizUseCase } from '@application/use-cases/update-quiz.use-case';
import { DeleteQuizUseCase } from '@application/use-cases/delete-quiz.use-case';
import { ListAllQuizzesUseCase } from '@application/use-cases/list-all-quizzes.use-case';
import type { RoundSummaryDTO } from '@application/dtos/round-summary.dto';

type QuizStateDTO = Awaited<ReturnType<GetQuizStateUseCase['execute']>>;
type AdvanceQuestionResponse = Awaited<
  ReturnType<AdvanceQuestionUseCase['execute']>
>;
type ResetTimerResponse = Awaited<ReturnType<ResetQuizTimerUseCase['execute']>>;
type LeaderboardSnapshot = Awaited<
  ReturnType<SnapshotLeaderboardUseCase['execute']>
>;
type LockQuestionResponse = Awaited<ReturnType<LockQuestionUseCase['execute']>>;

describe('QuizService', () => {
  let startQuizUseCase: Mocked<StartQuizUseCase>;
  let endQuizUseCase: Mocked<EndQuizUseCase>;
  let findQuizByIdUseCase: Mocked<FindQuizByIdUseCase>;
  let getQuizStateUseCase: Mocked<GetQuizStateUseCase>;
  let advanceQuestionUseCase: Mocked<AdvanceQuestionUseCase>;
  let resetQuizTimerUseCase: Mocked<ResetQuizTimerUseCase>;
  let snapshotLeaderboardUseCase: Mocked<SnapshotLeaderboardUseCase>;
  let lockQuestionUseCase: Mocked<LockQuestionUseCase>;
  let createQuizUseCase: Mocked<CreateQuizUseCase>;
  let updateQuizUseCase: Mocked<UpdateQuizUseCase>;
  let deleteQuizUseCase: Mocked<DeleteQuizUseCase>;
  let listAllQuizzesUseCase: Mocked<ListAllQuizzesUseCase>;
  let quizService: QuizService;

  beforeEach(() => {
    startQuizUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<StartQuizUseCase>;

    endQuizUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<EndQuizUseCase>;

    findQuizByIdUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<FindQuizByIdUseCase>;

    getQuizStateUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<GetQuizStateUseCase>;

    advanceQuestionUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<AdvanceQuestionUseCase>;

    resetQuizTimerUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<ResetQuizTimerUseCase>;

    snapshotLeaderboardUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<SnapshotLeaderboardUseCase>;

    lockQuestionUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<LockQuestionUseCase>;

    createQuizUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<CreateQuizUseCase>;

    updateQuizUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<UpdateQuizUseCase>;

    deleteQuizUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<DeleteQuizUseCase>;

    listAllQuizzesUseCase = {
      execute: vi.fn(),
    } as unknown as Mocked<ListAllQuizzesUseCase>;

    quizService = new QuizService(
      startQuizUseCase,
      endQuizUseCase,
      findQuizByIdUseCase,
      getQuizStateUseCase,
      advanceQuestionUseCase,
      resetQuizTimerUseCase,
      snapshotLeaderboardUseCase,
      lockQuestionUseCase,
      createQuizUseCase,
      updateQuizUseCase,
      deleteQuizUseCase,
      listAllQuizzesUseCase
    );
  });

  it('should start a quiz', async () => {
    await quizService.startQuiz('quiz1');
    expect(startQuizUseCase.execute).toHaveBeenCalledWith('quiz1');
  });

  it('should end a quiz', async () => {
    endQuizUseCase.execute.mockResolvedValue(undefined);

    await quizService.endQuiz('quiz1');
    expect(endQuizUseCase.execute).toHaveBeenCalledWith('quiz1');
  });

  it('should fetch quiz details', async () => {
    const quizDetails = new QuizSessionAggregate(
      new Quiz('quiz1', 'Quiz 1', [], {
        allowSkipping: true,
        timePerQuestion: 30,
      }),
      60
    );

    findQuizByIdUseCase.execute.mockResolvedValueOnce(quizDetails);

    const result = await quizService.getQuizDetails('quiz1');
    expect(findQuizByIdUseCase.execute).toHaveBeenCalledWith('quiz1');
    expect(result).toEqual(quizDetails);
  });

  it('should throw an error if quiz details are not found', async () => {
    findQuizByIdUseCase.execute.mockRejectedValueOnce(
      new Error(`Quiz with ID quiz1 not found`)
    );

    await expect(quizService.getQuizDetails('quiz1')).rejects.toThrow(
      `Quiz with ID quiz1 not found`
    );
    expect(findQuizByIdUseCase.execute).toHaveBeenCalledWith('quiz1');
  });

  it('returns quiz state DTOs', async () => {
    const dto = {
      id: 'quiz1',
      title: 'Quiz 1',
      status: 'Active',
      currentQuestionIndex: 0,
      settings: { timePerQuestion: 30, allowSkipping: false },
      questions: [],
      players: [],
      answers: undefined,
      leaderboard: [],
      activeQuestionId: null,
      startTime: null,
      endTime: null,
      joinCode: null,
      timer: {
        duration: 30,
        remainingSeconds: 30,
        startTime: null,
        endTime: null,
      },
    } as QuizStateDTO;

    getQuizStateUseCase.execute.mockResolvedValue(dto);

    const result = await quizService.getQuizState('quiz1');
    expect(getQuizStateUseCase.execute).toHaveBeenCalledWith('quiz1');
    expect(result).toBe(dto);
  });

  it('advances to the next question', async () => {
    const advanceResult = {
      question: {
        id: 'q2',
        text: 'Q2',
        media: undefined,
        mediaType: undefined,
        options: undefined,
        type: 'multiple-choice',
        points: 10,
        orderIndex: 1,
      },
      timer: {
        duration: 30,
        remainingSeconds: 30,
        startTime: '2025-01-01T00:00:00.000Z',
        endTime: '2025-01-01T00:00:30.000Z',
      },
    } as AdvanceQuestionResponse;

    advanceQuestionUseCase.execute.mockResolvedValue(advanceResult);

    const result = await quizService.advanceToNextQuestion('quiz1');
    expect(advanceQuestionUseCase.execute).toHaveBeenCalledWith('quiz1');
    expect(result).toEqual(advanceResult);
  });

  it('resets the timer via the timer use case', async () => {
    const timerResult = {
      duration: 45,
      remainingSeconds: 45,
      startTime: '2025-01-01T00:00:00.000Z',
      endTime: '2025-01-01T00:00:45.000Z',
    } as ResetTimerResponse;

    resetQuizTimerUseCase.execute.mockResolvedValue(timerResult);

    const response = await quizService.resetTimer('quiz1', 45);

    expect(resetQuizTimerUseCase.execute).toHaveBeenCalledWith({
      quizId: 'quiz1',
      durationSeconds: 45,
    });
    expect(response).toEqual(timerResult);
  });

  it('snapshots the leaderboard', async () => {
    const leaderboard = [{ playerId: 'p1', score: 20 }];
    snapshotLeaderboardUseCase.execute.mockResolvedValue(
      leaderboard as LeaderboardSnapshot
    );

    const response = await quizService.snapshotLeaderboard('quiz1');
    expect(snapshotLeaderboardUseCase.execute).toHaveBeenCalledWith('quiz1');
    expect(response).toEqual(leaderboard);
  });

  describe('lockQuestion', () => {
    it('should lock question and return round summary', async () => {
      const roundSummary: RoundSummaryDTO = {
        questionId: 'q1',
        questionText: 'What is 2+2?',
        correctAnswer: '4',
        questionIndex: 0,
        playerResults: [
          {
            playerId: 'p1',
            playerName: 'Alice',
            answerSubmitted: true,
            correct: true,
            timeTaken: 5,
            pointsEarned: 100,
          },
        ],
        averageTime: 5,
        correctCount: 1,
        totalPlayers: 1,
        leaderboardDeltas: [
          {
            playerId: 'p1',
            playerName: 'Alice',
            previousRank: null,
            currentRank: 1,
            rankChange: 0,
            previousScore: null,
            currentScore: 100,
          },
        ],
        lockedAt: '2025-01-01T00:00:00.000Z',
      };

      lockQuestionUseCase.execute.mockResolvedValue(
        roundSummary as LockQuestionResponse
      );

      const result = await quizService.lockQuestion('quiz1');

      expect(lockQuestionUseCase.execute).toHaveBeenCalledWith('quiz1');
      expect(result).toEqual(roundSummary);
    });

    it('should throw error if quiz is not active', async () => {
      lockQuestionUseCase.execute.mockRejectedValue(
        new Error('Quiz is not active or does not exist.')
      );

      await expect(quizService.lockQuestion('quiz1')).rejects.toThrow(
        'Quiz is not active or does not exist.'
      );
    });

    it('should throw error if no active question', async () => {
      lockQuestionUseCase.execute.mockRejectedValue(
        new Error('No active question to lock.')
      );

      await expect(quizService.lockQuestion('quiz1')).rejects.toThrow(
        'No active question to lock.'
      );
    });
  });
});
