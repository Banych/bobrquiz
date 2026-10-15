import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    quizMocks.upsert.mockReset();
    questionMocks.findMany.mockReset();
    questionMocks.createMany.mockReset();
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
      expect.objectContaining({ where: { joinCode: 'TRYBOBR' } })
    );
    expect(questionMocks.createMany).toHaveBeenCalledTimes(1);
    expect(questionMocks.createMany.mock.calls[0][0].data).toHaveLength(5);
  });
});
