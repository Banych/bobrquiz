import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IQuestionRepository } from '@domain/repositories/question-repository';
import { Question } from '@domain/entities/question';
import { GetQuizQuestionUseCase } from '@application/use-cases/get-quiz-question.use-case';
import { UpdateQuestionUseCase } from '@application/use-cases/update-question.use-case';
import { DeleteQuestionUseCase } from '@application/use-cases/delete-question.use-case';
import { ReorderQuestionsUseCase } from '@application/use-cases/reorder-questions.use-case';
import { FakeMediaStorage } from '@/tests/support/fake-media-storage';

const OWN_QUIZ = 'quiz-own';
const OTHER_QUIZ = 'quiz-other';

const makeQuestion = (id: string, quizId: string): Question => {
  const question = new Question(id, 'Capital of France?', ['Paris'], 'text', 1);
  question.quizId = quizId;
  return question;
};

const questions: Record<string, Question> = {};

describe('Question use cases scoped to their quiz', () => {
  const questionRepository = {
    findById: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    updateOrder: vi.fn(),
  } as unknown as IQuestionRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    questions['q-own'] = makeQuestion('q-own', OWN_QUIZ);
    questions['q-other'] = makeQuestion('q-other', OTHER_QUIZ);
    vi.mocked(questionRepository.findById).mockImplementation(
      async (id: string) => questions[id] ?? null
    );
  });

  describe('GetQuizQuestionUseCase', () => {
    const useCase = new GetQuizQuestionUseCase(questionRepository);

    it('returns a question of the given quiz', async () => {
      await expect(useCase.execute(OWN_QUIZ, 'q-own')).resolves.toBe(
        questions['q-own']
      );
    });

    it('throws the same error for a missing question and one from another quiz', async () => {
      await expect(useCase.execute(OWN_QUIZ, 'q-missing')).rejects.toThrow(
        'Question not found: q-missing'
      );
      await expect(useCase.execute(OWN_QUIZ, 'q-other')).rejects.toThrow(
        'Question not found: q-other'
      );
    });
  });

  describe('UpdateQuestionUseCase', () => {
    const useCase = new UpdateQuestionUseCase(
      questionRepository,
      new FakeMediaStorage()
    );

    it('updates a question of the given quiz', async () => {
      const updated = await useCase.execute(OWN_QUIZ, 'q-own', {
        text: 'New text',
      });

      expect(updated.text).toBe('New text');
      expect(questionRepository.save).toHaveBeenCalledWith(questions['q-own']);
    });

    it('rejects a question from another quiz as not found, without saving', async () => {
      await expect(
        useCase.execute(OWN_QUIZ, 'q-other', { text: 'Hijack' })
      ).rejects.toThrow('Question not found: q-other');
      expect(questions['q-other'].text).toBe('Capital of France?');
      expect(questionRepository.save).not.toHaveBeenCalled();
    });

    it('rejects a missing question as not found', async () => {
      await expect(
        useCase.execute(OWN_QUIZ, 'q-missing', { text: 'x' })
      ).rejects.toThrow('Question not found: q-missing');
    });
  });

  describe('DeleteQuestionUseCase', () => {
    const useCase = new DeleteQuestionUseCase(questionRepository);

    it('deletes a question of the given quiz', async () => {
      await useCase.execute(OWN_QUIZ, 'q-own');

      expect(questionRepository.delete).toHaveBeenCalledWith('q-own');
    });

    it('rejects a question from another quiz as not found, without deleting', async () => {
      await expect(useCase.execute(OWN_QUIZ, 'q-other')).rejects.toThrow(
        'Question not found: q-other'
      );
      expect(questionRepository.delete).not.toHaveBeenCalled();
    });

    it('rejects a missing question as not found', async () => {
      await expect(useCase.execute(OWN_QUIZ, 'q-missing')).rejects.toThrow(
        'Question not found: q-missing'
      );
    });
  });

  describe('ReorderQuestionsUseCase', () => {
    const useCase = new ReorderQuestionsUseCase(questionRepository);

    it('reorders questions of the given quiz', async () => {
      await useCase.execute(
        { questions: [{ id: 'q-own', orderIndex: 3 }] },
        OWN_QUIZ
      );

      expect(questionRepository.updateOrder).toHaveBeenCalledWith([
        { questionId: 'q-own', orderIndex: 3 },
      ]);
    });

    it("rejects another quiz's question as not found, without naming that quiz", async () => {
      const result = useCase.execute(
        {
          questions: [
            { id: 'q-own', orderIndex: 0 },
            { id: 'q-other', orderIndex: 1 },
          ],
        },
        OWN_QUIZ
      );

      await expect(result).rejects.toThrow('Question not found: q-other');
      await expect(result).rejects.not.toThrow(OTHER_QUIZ);
      expect(questionRepository.updateOrder).not.toHaveBeenCalled();
    });

    it('rejects a missing question as not found', async () => {
      await expect(
        useCase.execute(
          { questions: [{ id: 'q-missing', orderIndex: 0 }] },
          OWN_QUIZ
        )
      ).rejects.toThrow('Question not found: q-missing');
    });
  });
});
