import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Question } from '@domain/entities/question';

const questionRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { $disconnect: vi.fn() },
}));
vi.mock('@infrastructure/repositories/prisma-question.repository', () => ({
  PrismaQuestionRepository: vi.fn(function PrismaQuestionRepository() {
    return questionRepo;
  }),
}));

import { getServices } from '@application/services/factories';

const QUIZ = 'quiz-1';
const QUESTION = 'question-1';

// The routes' tests replace the whole container, and quizId and questionId are
// both strings, so only this test catches the factory passing them swapped.
describe('questionService wiring (factories)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const question = new Question(QUESTION, 'Text', ['a'], 'text', 1);
    question.quizId = QUIZ;
    questionRepo.findById.mockImplementation(async (id: string) =>
      id === QUESTION ? question : null
    );
  });

  it('getQuizQuestion passes the quiz and question ids in order', async () => {
    const question = await getServices().questionService.getQuizQuestion(
      QUIZ,
      QUESTION
    );

    expect(question.id).toBe(QUESTION);
  });

  it('updateQuestion passes the quiz and question ids in order', async () => {
    await getServices().questionService.updateQuestion(QUIZ, QUESTION, {
      text: 'New',
    });

    expect(questionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: QUESTION, text: 'New' })
    );
  });

  it('deleteQuestion passes the quiz and question ids in order', async () => {
    await getServices().questionService.deleteQuestion(QUIZ, QUESTION);

    expect(questionRepo.delete).toHaveBeenCalledWith(QUESTION);
  });

  it('reorderQuestions passes the quiz id', async () => {
    await getServices().questionService.reorderQuestions(
      { questions: [{ id: QUESTION, orderIndex: 2 }] },
      QUIZ
    );

    expect(questionRepo.updateOrder).toHaveBeenCalledWith([
      { questionId: QUESTION, orderIndex: 2 },
    ]);
  });
});
