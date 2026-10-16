import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { PrismaQuizRepository } from '@infrastructure/repositories/prisma-quiz.repository';
import { LockQuestionUseCase } from '@application/use-cases/lock-question.use-case';
import { SubmitAnswerUseCase } from '@application/use-cases/submit-answer.use-case';
import { ResetQuizUseCase } from '@application/use-cases/reset-quiz.use-case';
import { StartQuizUseCase } from '@application/use-cases/start-quiz.use-case';
import { Player } from '@domain/entities/player';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { ILeaderboardSnapshotRepository } from '@domain/repositories/leaderboard-snapshot-repository';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    quiz: {} as Row,
    questions: [] as Row[],
    answers: [] as Row[],
  };
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(
      ([key, value]) => (row[key] ?? null) === (value ?? null)
    );
  const client = {
    state,
    quiz: {
      findUnique: vi.fn(async ({ where }: { where: Row }) =>
        matches(state.quiz, where)
          ? {
              ...state.quiz,
              questions: state.questions.map((question) => ({ ...question })),
              players: [{ id: 'player-1' }],
              answers: state.answers.map((answer) => ({ ...answer })),
            }
          : null
      ),
      update: vi.fn(async ({ data }: { data: Row }) =>
        Object.assign(state.quiz, data)
      ),
    },
    question: {
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = state.questions.filter((question) =>
          matches(question, where)
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    answer: {
      deleteMany: vi.fn(async () => {
        const count = state.answers.length;
        state.answers = [];
        return { count };
      }),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        state.answers.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(
      async (operations: unknown): Promise<unknown> =>
        typeof operations === 'function'
          ? (operations as (tx: unknown) => Promise<unknown>)(client)
          : Promise.all(operations as Promise<unknown>[])
    ),
  };
  return client;
});

vi.mock('@infrastructure/database/prisma/client', () => ({ prisma: db }));

const makeQuestionRow = (id: string, orderIndex: number): Row => ({
  id,
  quizId: 'quiz-1',
  text: `Question ${id}`,
  mediaUrl: null,
  mediaType: null,
  options: [],
  correctAnswers: ['4'],
  type: 'text',
  points: 10,
  orderIndex,
  isPublished: true,
  answersLockedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
});

describe('answer lock persistence', () => {
  const quizRepository = new PrismaQuizRepository();
  let playerRepository: Mocked<IPlayerRepository>;
  let snapshotRepository: Mocked<ILeaderboardSnapshotRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    const now = new Date();
    db.state.quiz = {
      id: 'quiz-1',
      title: 'Math',
      status: 'Active',
      currentQuestionIndex: 0,
      activeQuestionId: 'q1',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
      scoringDecayRate: 2.0,
      joinCode: 'JOIN',
      startTime: now,
      endTime: null,
      timerStartedAt: now,
      timerExpiresAt: new Date(now.getTime() + 30_000),
    };
    db.state.questions = [makeQuestionRow('q1', 0), makeQuestionRow('q2', 1)];
    db.state.answers = [];

    playerRepository = {
      findById: vi
        .fn()
        .mockResolvedValue(new Player('player-1', 'Alice', 'quiz-1')),
      listByQuizId: vi.fn().mockResolvedValue([]),
      findByQuizIdAndName: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateScore: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IPlayerRepository>;

    snapshotRepository = {
      saveSnapshots: vi.fn(),
      findByQuizAndQuestion: vi.fn().mockResolvedValue([]),
      findByQuizAndPlayer: vi.fn(),
      findByQuiz: vi.fn(),
      deleteByQuiz: vi.fn(),
    } as unknown as Mocked<ILeaderboardSnapshotRepository>;
  });

  const lock = () =>
    new LockQuestionUseCase(
      quizRepository,
      playerRepository,
      snapshotRepository
    ).execute('quiz-1');

  it('keeps the current question locked after the quiz is reloaded', async () => {
    await lock();

    const reloaded = await quizRepository.findById('quiz-1');

    expect(reloaded?.isQuestionLocked('q1')).toBe(true);
    expect(reloaded?.isQuestionLocked('q2')).toBe(false);
  });

  it('rejects an answer submitted after the lock in a later request', async () => {
    await lock();

    await expect(
      new SubmitAnswerUseCase(quizRepository, playerRepository).execute(
        'quiz-1',
        'player-1',
        'q1',
        '4'
      )
    ).rejects.toThrow('Answers are locked for this question.');
  });

  it('a stale aggregate saved after the lock does not undo it', async () => {
    const stale = await quizRepository.findById('quiz-1');
    await lock();

    await quizRepository.save(stale!);

    const reloaded = await quizRepository.findById('quiz-1');
    expect(reloaded?.isQuestionLocked('q1')).toBe(true);
  });

  it('rejects a second lock and writes one snapshot set', async () => {
    await lock();

    await expect(lock()).rejects.toThrow('Question already locked');
    expect(snapshotRepository.saveSnapshots).toHaveBeenCalledTimes(1);
  });

  it('lets exactly one of two concurrent locks win', async () => {
    const lockQuestionSpy = vi.spyOn(quizRepository, 'lockQuestion');

    const results = await Promise.allSettled([lock(), lock()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toEqual(
      new Error('Question already locked')
    );
    // Both requests reached the repository, so the false branch decided it
    const outcomes = await Promise.all(
      lockQuestionSpy.mock.results.map((r) => r.value as Promise<boolean>)
    );
    expect(outcomes.sort()).toEqual([false, true]);
    expect(snapshotRepository.saveSnapshots).toHaveBeenCalledTimes(1);
    lockQuestionSpy.mockRestore();
  });

  it('clears a lock written after a reset when the quiz starts again', async () => {
    await new ResetQuizUseCase(quizRepository).execute('quiz-1');
    // A lock request that loaded the Active quiz before the reset writes late
    expect(await quizRepository.lockQuestion('quiz-1', 'q2', new Date())).toBe(
      true
    );

    await new StartQuizUseCase(quizRepository).execute('quiz-1');

    const reloaded = await quizRepository.findById('quiz-1');
    expect(reloaded?.isQuestionLocked('q2')).toBe(false);
  });

  it('clears persisted locks when the quiz is reset', async () => {
    await lock();
    const beforeReset = await quizRepository.findById('quiz-1');
    expect(beforeReset?.isQuestionLocked('q1')).toBe(true);
    await new ResetQuizUseCase(quizRepository).execute('quiz-1');

    const reloaded = await quizRepository.findById('quiz-1');

    expect(reloaded?.quizQuestions).toHaveLength(2);
    expect(
      reloaded?.quizQuestions.every((question) => !question.answersLockedAt)
    ).toBe(true);
  });
});
