import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER_ID = '0b8f5e0c-7f8e-4c63-9a53-3f8d2f0f6a11';

const quizMocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

const questionMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    quiz: quizMocks,
    question: questionMocks,
  },
}));

describe('seedLaunchDemoQuiz', () => {
  beforeEach(() => {
    vi.stubEnv('SEED_QUIZ_OWNER_ID', OWNER_ID);
    quizMocks.upsert.mockReset();
    questionMocks.findMany.mockReset();
    questionMocks.createMany.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('upserts the quiz by a fixed join code and creates questions only once', async () => {
    const quiz = { id: 'demo-quiz-1', joinCode: 'TRYBOBR' };
    const createdQuestions = [{ id: 'q1' }, { id: 'q2' }];

    quizMocks.upsert.mockResolvedValue(quiz);
    questionMocks.findMany
      .mockResolvedValueOnce([]) // first run: no questions yet
      .mockResolvedValueOnce(createdQuestions) // first run: refetch after create
      .mockResolvedValueOnce(createdQuestions); // second run: already seeded

    const { seedLaunchDemoQuiz } =
      await import('@infrastructure/database/prisma/seed-helpers');

    await seedLaunchDemoQuiz();
    await seedLaunchDemoQuiz();

    expect(quizMocks.upsert).toHaveBeenCalledTimes(2);
    expect(quizMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { joinCode: 'TRYBOBR' },
        create: expect.objectContaining({ ownerId: OWNER_ID }),
      })
    );
    expect(questionMocks.createMany).toHaveBeenCalledTimes(1);
    expect(questionMocks.createMany.mock.calls[0][0].data).toHaveLength(5);
  });

  it('touches no table when the owner id is missing', async () => {
    vi.stubEnv('SEED_QUIZ_OWNER_ID', '');

    const { seedLaunchDemoQuiz } =
      await import('@infrastructure/database/prisma/seed-helpers');

    await expect(seedLaunchDemoQuiz()).rejects.toThrow(/SEED_QUIZ_OWNER_ID/);
    expect(quizMocks.upsert).not.toHaveBeenCalled();
  });
});
