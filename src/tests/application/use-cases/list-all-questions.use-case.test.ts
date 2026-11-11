import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { IQuestionRepository } from '@domain/repositories/question-repository';
import { ListAllQuestionsUseCase } from '@application/use-cases/list-all-questions.use-case';
import { Quiz } from '@domain/entities/quiz';
import { Question } from '@domain/entities/question';

const makeQuiz = (id: string, title: string): Quiz => {
  const q = new Quiz(id, title, [], {
    timePerQuestion: 30,
    allowSkipping: false,
    scoringAlgorithm: 'EXPONENTIAL_DECAY',
    scoringDecayRate: 1,
  });
  return q;
};

const makeQuestion = (
  id: string,
  text: string,
  type: 'multiple-choice' | 'text' | 'true/false' = 'multiple-choice',
  orderIndex = 0
): Question => {
  const q = new Question(id, text, ['Answer A'], type, 10);
  q.orderIndex = orderIndex;
  return q;
};

const mockQuizRepo = {
  findById: vi.fn(),
  findByJoinCode: vi.fn(),
  listByStatus: vi.fn(),
  save: vi.fn(),
  updateCurrentQuestion: vi.fn(),
  updateLeaderboard: vi.fn(),
  delete: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findAll: vi.fn(),
  listByOwner: vi.fn(),
  findEntityById: vi.fn(),
} as unknown as IQuizRepository;

const mockQuestionRepo = {
  findById: vi.fn(),
  listByQuizId: vi.fn(),
  listPublishedByQuizId: vi.fn(),
  updatePublishState: vi.fn(),
  updateOrder: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
} as unknown as IQuestionRepository;

const OWNER = 'owner-1';

describe('ListAllQuestionsUseCase', () => {
  let useCase: ListAllQuestionsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ListAllQuestionsUseCase(mockQuizRepo, mockQuestionRepo);
  });

  it("returns questions from all the owner's quizzes with quizId and quizTitle", async () => {
    const quiz1 = makeQuiz('quiz-1', 'Quiz One');
    const quiz2 = makeQuiz('quiz-2', 'Quiz Two');
    vi.mocked(mockQuizRepo.listByOwner).mockResolvedValueOnce([quiz1, quiz2]);
    vi.mocked(mockQuestionRepo.listByQuizId).mockImplementation(async (id) => {
      if (id === 'quiz-1')
        return [makeQuestion('q-1', 'Q1'), makeQuestion('q-2', 'Q2')];
      if (id === 'quiz-2')
        return [makeQuestion('q-3', 'Q3'), makeQuestion('q-4', 'Q4')];
      return [];
    });

    const result = await useCase.execute({ ownerId: OWNER });

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      id: 'q-1',
      quizId: 'quiz-1',
      quizTitle: 'Quiz One',
    });
    expect(result[2]).toMatchObject({
      id: 'q-3',
      quizId: 'quiz-2',
      quizTitle: 'Quiz Two',
    });
  });

  it("filters by quizId inside the owner's quizzes", async () => {
    vi.mocked(mockQuizRepo.listByOwner).mockResolvedValueOnce([
      makeQuiz('quiz-1', 'Quiz One'),
      makeQuiz('quiz-2', 'Quiz Two'),
    ]);
    vi.mocked(mockQuestionRepo.listByQuizId).mockResolvedValueOnce([
      makeQuestion('q-1', 'Q1'),
      makeQuestion('q-2', 'Q2'),
    ]);

    const result = await useCase.execute({ ownerId: OWNER, quizId: 'quiz-1' });

    expect(mockQuizRepo.listByOwner).toHaveBeenCalledWith(OWNER);
    expect(mockQuestionRepo.listByQuizId).toHaveBeenCalledTimes(1);
    expect(mockQuestionRepo.listByQuizId).toHaveBeenCalledWith('quiz-1');
    expect(result).toHaveLength(2);
    expect(result.every((q) => q.quizId === 'quiz-1')).toBe(true);
  });

  it('filters by type when provided', async () => {
    const quiz1 = makeQuiz('quiz-1', 'Quiz One');
    vi.mocked(mockQuizRepo.listByOwner).mockResolvedValueOnce([quiz1]);
    vi.mocked(mockQuestionRepo.listByQuizId).mockResolvedValueOnce([
      makeQuestion('q-1', 'MC question', 'multiple-choice'),
      makeQuestion('q-2', 'TF question', 'true/false'),
      makeQuestion('q-3', 'Another MC', 'multiple-choice'),
    ]);

    const result = await useCase.execute({
      ownerId: OWNER,
      type: 'multiple-choice',
    });

    expect(result).toHaveLength(2);
    expect(result.every((q) => q.type === 'multiple-choice')).toBe(true);
  });

  it('returns empty array when quiz has no questions', async () => {
    const quiz1 = makeQuiz('quiz-1', 'Empty Quiz');
    vi.mocked(mockQuizRepo.listByOwner).mockResolvedValueOnce([quiz1]);
    vi.mocked(mockQuestionRepo.listByQuizId).mockResolvedValueOnce([]);

    const result = await useCase.execute({ ownerId: OWNER });

    expect(result).toHaveLength(0);
  });

  it("returns nothing for another owner's quizId, without reading its questions", async () => {
    vi.mocked(mockQuizRepo.listByOwner).mockResolvedValueOnce([
      makeQuiz('quiz-1', 'Quiz One'),
    ]);

    const result = await useCase.execute({
      ownerId: OWNER,
      quizId: 'someone-elses-quiz',
    });

    expect(result).toHaveLength(0);
    expect(mockQuizRepo.findEntityById).not.toHaveBeenCalled();
    expect(mockQuizRepo.findAll).not.toHaveBeenCalled();
    expect(mockQuestionRepo.listByQuizId).not.toHaveBeenCalled();
  });

  it('never reads quizzes outside the owner list', async () => {
    vi.mocked(mockQuizRepo.listByOwner).mockResolvedValueOnce([]);

    const result = await useCase.execute({ ownerId: OWNER });

    expect(result).toEqual([]);
    expect(mockQuizRepo.findAll).not.toHaveBeenCalled();
    expect(mockQuestionRepo.listByQuizId).not.toHaveBeenCalled();
  });
});
