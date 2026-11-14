import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IQuestionRepository } from '@domain/repositories/question-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import { Question } from '@domain/entities/question';
import type { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { MAX_QUESTIONS_PER_QUIZ } from '@domain/value-objects/host-limits';
import type { CreateQuestionDTO } from '@application/dtos/question-admin.dto';
import { CreateQuestionUseCase } from '@application/use-cases/create-question.use-case';
import { FakeMediaStorage } from '@/tests/support/fake-media-storage';

const QUIZ_ID = 'quiz-1';

const makeQuestions = (count: number): Question[] =>
  Array.from({ length: count }, (_, index) => {
    const question = new Question(`q-${index}`, 'Text', ['a'], 'text', 10);
    question.quizId = QUIZ_ID;
    question.orderIndex = index;
    return question;
  });

const dto: CreateQuestionDTO = {
  quizId: QUIZ_ID,
  text: 'New question',
  type: 'text',
  correctAnswers: ['a'],
  options: [],
  points: 10,
  mediaUrl: null,
  mediaType: null,
};

describe('CreateQuestionUseCase', () => {
  const questionRepository = {
    listByQuizId: vi.fn(),
    save: vi.fn(),
  } as unknown as IQuestionRepository;
  const quizRepository = {
    findById: vi.fn(),
  } as unknown as IQuizRepository;

  const useCase = new CreateQuestionUseCase(
    questionRepository,
    quizRepository,
    new FakeMediaStorage()
  );

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(quizRepository.findById).mockResolvedValue({
      id: QUIZ_ID,
    } as unknown as QuizSessionAggregate);
    vi.mocked(questionRepository.listByQuizId).mockResolvedValue([]);
  });

  it('appends the question after the last one', async () => {
    vi.mocked(questionRepository.listByQuizId).mockResolvedValue(
      makeQuestions(3)
    );

    const question = await useCase.execute(dto);

    expect(question.quizId).toBe(QUIZ_ID);
    expect(question.orderIndex).toBe(3);
    expect(questionRepository.save).toHaveBeenCalledWith(question);
  });

  it('throws not found for a missing quiz', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(null);

    await expect(useCase.execute(dto)).rejects.toThrow(
      `Quiz not found: ${QUIZ_ID}`
    );
    expect(questionRepository.save).not.toHaveBeenCalled();
  });

  describe('per-quiz question cap', () => {
    it('accepts the last question below the cap', async () => {
      vi.mocked(questionRepository.listByQuizId).mockResolvedValue(
        makeQuestions(MAX_QUESTIONS_PER_QUIZ - 1)
      );

      await expect(useCase.execute(dto)).resolves.toBeDefined();
      expect(questionRepository.save).toHaveBeenCalledTimes(1);
    });

    it('refuses a question once the quiz is at the cap', async () => {
      vi.mocked(questionRepository.listByQuizId).mockResolvedValue(
        makeQuestions(MAX_QUESTIONS_PER_QUIZ)
      );

      await expect(useCase.execute(dto)).rejects.toThrow(
        `Limit reached: a quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions. Delete one to add another.`
      );
      expect(questionRepository.save).not.toHaveBeenCalled();
    });
  });
});
