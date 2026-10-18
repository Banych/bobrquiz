import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Quiz, QuizStatus } from '@domain/entities/quiz';
import { Question } from '@domain/entities/question';
import { PrismaQuizRepository } from '@infrastructure/repositories/prisma-quiz.repository';
import { prisma } from '@infrastructure/database/prisma/client';

vi.mock('node:crypto', () => ({
  randomUUID: () => 'answer-uuid',
}));

const quizMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const answerMocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  createMany: vi.fn(),
}));

const questionMocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

const playerMocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateMany: vi.fn(),
}));

const transactionMock = vi.hoisted(() =>
  vi.fn(async (operations: Promise<unknown>[]) => {
    await Promise.all(operations);
  })
);

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    quiz: quizMocks,
    answer: answerMocks,
    player: playerMocks,
    question: questionMocks,
    $transaction: transactionMock,
  },
}));

const repository = new PrismaQuizRepository();

describe('PrismaQuizRepository', () => {
  beforeEach(() => {
    Object.values(quizMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(answerMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(playerMocks).forEach((mockFn) => mockFn.mockReset());
    Object.values(questionMocks).forEach((mockFn) => mockFn.mockReset());
    transactionMock.mockClear();
  });

  it('maps a quiz record into an aggregate', async () => {
    const now = new Date('2025-01-01T00:00:00Z');
    quizMocks.findUnique.mockResolvedValue({
      id: 'quiz-1',
      title: 'General Knowledge',
      status: 'Active',
      currentQuestionIndex: 0,
      activeQuestionId: 'q1',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'FIXED',
      scoringDecayRate: null,
      joinCode: 'JOIN',
      startTime: now,
      endTime: null,
      timerStartedAt: now,
      timerExpiresAt: new Date(now.getTime() + 30_000),
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'q2',
          quizId: 'quiz-1',
          text: 'Second question',
          mediaUrl: null,
          mediaType: null,
          options: [],
          correctAnswers: ['B'],
          type: 'text',
          points: 5,
          orderIndex: 2,
          isPublished: true,
          answersLockedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'q1',
          quizId: 'quiz-1',
          text: 'First question',
          mediaUrl: null,
          mediaType: null,
          options: ['3', '4'],
          correctAnswers: ['4'],
          type: 'multiple_choice',
          points: 10,
          orderIndex: 1,
          isPublished: true,
          answersLockedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      players: [{ id: 'player-1' }],
      answers: [
        {
          id: 'answer-1',
          quizId: 'quiz-1',
          playerId: 'player-1',
          questionId: 'q1',
          value: '4',
          submittedAt: now,
          isCorrect: true,
          points: 10,
          timeTakenMs: 5000,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const aggregate = await repository.findById('quiz-1');

    expect(aggregate).toBeInstanceOf(QuizSessionAggregate);
    expect(aggregate?.quizQuestions[0].id).toBe('q1');
    expect(aggregate?.quizQuestions[0].answersLockedAt).toBeUndefined();
    expect(aggregate?.playerIds).toContain('player-1');
    expect(aggregate?.answers.get('player-1')).toHaveLength(1);
    expect(aggregate?.answers.get('player-1')?.[0].timeTaken).toBe(5);
    expect(aggregate?.timerStartTime?.toISOString()).toBe(now.toISOString());
    expect(aggregate?.timerEndTime?.toISOString()).toBe(
      new Date(now.getTime() + 30_000).toISOString()
    );
  });

  it('restores a persisted answer lock when loading the aggregate', async () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const lockedAt = new Date('2025-01-01T00:00:20Z');
    quizMocks.findUnique.mockResolvedValue({
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
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'q1',
          quizId: 'quiz-1',
          text: 'What is 2 + 2?',
          mediaUrl: null,
          mediaType: null,
          options: [],
          correctAnswers: ['4'],
          type: 'text',
          points: 10,
          orderIndex: 0,
          isPublished: true,
          answersLockedAt: lockedAt,
          createdAt: now,
          updatedAt: now,
        },
      ],
      players: [{ id: 'player-1' }],
      answers: [],
    });

    const aggregate = await repository.findById('quiz-1');

    expect(aggregate?.quizQuestions[0].answersLockedAt).toEqual(lockedAt);
    expect(aggregate?.isQuestionLocked('q1')).toBe(true);
    expect(() => aggregate?.submitAnswer('player-1', 'q1', '4')).toThrow(
      'Answers are locked for this question.'
    );
  });

  it('locks a question only if it belongs to the quiz and is not locked yet', async () => {
    const lockedAt = new Date('2025-01-01T00:00:20Z');
    questionMocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.lockQuestion('quiz-1', 'q1', lockedAt)
    ).resolves.toBe(true);

    expect(questionMocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', quizId: 'quiz-1', answersLockedAt: null },
      data: { answersLockedAt: lockedAt },
    });
  });

  it('reports a lost race when the question is already locked', async () => {
    questionMocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.lockQuestion('quiz-1', 'q1', new Date())
    ).resolves.toBe(false);
  });

  it('clears every question lock in the quiz', async () => {
    questionMocks.updateMany.mockResolvedValue({ count: 3 });

    await repository.clearQuestionLocks('quiz-1');

    expect(questionMocks.updateMany).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
      data: { answersLockedAt: null },
    });
  });

  it('finds a quiz by join code', async () => {
    quizMocks.findUnique.mockResolvedValue(null);

    await repository.findByJoinCode('JOIN');

    expect(prisma.quiz.findUnique).toHaveBeenCalledWith({
      where: { joinCode: 'JOIN' },
      include: expect.any(Object),
    });
  });

  it('persists quiz state and answers via save', async () => {
    const question = new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10);
    const quiz = new Quiz('quiz-1', 'Math', [question], {
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'FIXED',
    });
    const aggregate = new QuizSessionAggregate(quiz, 30);
    aggregate.addPlayer('player-1');
    aggregate.startQuiz();
    aggregate.submitAnswer('player-1', 'q1', '4');

    await repository.save(aggregate);

    expect(prisma.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: expect.objectContaining({
        status: QuizStatus.Active,
        timerStartedAt: expect.any(Date),
        timerExpiresAt: expect.any(Date),
      }),
    });
    expect(prisma.answer.deleteMany).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
    });
    expect(prisma.answer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'answer-uuid',
          playerId: 'player-1',
          value: '4',
        }),
      ],
    });
  });

  it('lists quizzes by status', async () => {
    quizMocks.findMany.mockResolvedValue([]);

    await repository.listByStatus(QuizStatus.Pending);

    expect(prisma.quiz.findMany).toHaveBeenCalledWith({
      where: { status: QuizStatus.Pending },
      include: expect.any(Object),
      orderBy: { createdAt: 'desc' },
    });
  });

  it('updates the current question metadata', async () => {
    await repository.updateCurrentQuestion('quiz-1', {
      currentQuestionIndex: 2,
      activeQuestionId: 'q3',
    });

    expect(prisma.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: { currentQuestionIndex: 2, activeQuestionId: 'q3' },
    });
  });

  it('updates leaderboard scores and ranks', async () => {
    playerMocks.update.mockResolvedValue({ id: 'player-1' });
    playerMocks.updateMany.mockResolvedValue({ count: 1 });

    await repository.updateLeaderboard('quiz-1', [
      { playerId: 'player-1', score: 20 },
      { playerId: 'player-2', score: 10 },
    ]);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(prisma.player.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'player-1' },
      data: { score: 20, rank: 1 },
    });
    expect(prisma.player.updateMany).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1', id: { notIn: ['player-1', 'player-2'] } },
      data: { rank: null },
    });
  });

  it('resets ranks when leaderboard is empty', async () => {
    playerMocks.updateMany.mockResolvedValue({ count: 2 });

    await repository.updateLeaderboard('quiz-1', []);

    expect(prisma.player.updateMany).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
      data: { rank: null },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('deletes a quiz by id', async () => {
    quizMocks.delete.mockResolvedValue({ id: 'quiz-1' });

    await repository.delete('quiz-1');

    expect(prisma.quiz.delete).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
    });
  });

  describe('findAll', () => {
    const baseRecord = {
      id: 'quiz-1',
      title: 'General Knowledge',
      status: 'Pending',
      currentQuestionIndex: 0,
      timePerQuestion: 30,
      allowSkipping: false,
      joinCode: null,
      startTime: null,
      endTime: null,
      questions: [],
      players: [{ id: 'player-1' }],
      _count: { questions: 0, players: 1 },
    };

    it('excludes removed players from the resulting quiz player set', async () => {
      quizMocks.findMany.mockResolvedValue([baseRecord]);

      await repository.findAll();

      expect(prisma.quiz.findMany).toHaveBeenCalledWith({
        include: {
          questions: true,
          players: {
            where: { status: { not: 'Removed' } },
            select: { id: true },
          },
          _count: {
            select: { questions: true, players: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findEntityById', () => {
    const baseRecord = {
      id: 'quiz-1',
      title: 'General Knowledge',
      status: 'Pending',
      currentQuestionIndex: 0,
      timePerQuestion: 30,
      allowSkipping: false,
      joinCode: null,
      startTime: null,
      endTime: null,
      questions: [],
      players: [{ id: 'player-1' }],
    };

    it('excludes removed players from the players relation query', async () => {
      quizMocks.findUnique.mockResolvedValue(baseRecord);

      await repository.findEntityById('quiz-1');

      expect(prisma.quiz.findUnique).toHaveBeenCalledWith({
        where: { id: 'quiz-1' },
        include: {
          questions: true,
          players: {
            where: { status: { not: 'Removed' } },
            select: { id: true },
          },
        },
      });
    });

    it('returns null when the quiz does not exist', async () => {
      quizMocks.findUnique.mockResolvedValue(null);

      const quiz = await repository.findEntityById('missing-quiz');

      expect(quiz).toBeNull();
    });
  });
});
