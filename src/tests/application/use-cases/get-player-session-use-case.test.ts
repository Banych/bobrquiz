import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { GetPlayerSessionUseCase } from '@application/use-cases/get-player-session.use-case';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import { Quiz } from '@domain/entities/quiz';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Question } from '@domain/entities/question';
import { Player } from '@domain/entities/player';

const buildAggregate = () => {
  const quiz = new Quiz(
    'quiz-1',
    'General Knowledge',
    [
      new Question(
        'q-1',
        'What is 2 + 2?',
        ['4'],
        'multiple-choice',
        10,
        undefined,
        undefined,
        ['3', '4']
      ),
    ],
    { allowSkipping: false, timePerQuestion: 30 }
  );
  const aggregate = new QuizSessionAggregate(quiz, 30);
  aggregate.addPlayer('player-1');
  return aggregate;
};

describe('GetPlayerSessionUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let useCase: GetPlayerSessionUseCase;

  beforeEach(() => {
    quizRepository = {
      findById: vi.fn(),
      findByJoinCode: vi.fn(),
      listByStatus: vi.fn(),
      save: vi.fn(),
      updateCurrentQuestion: vi.fn(),
      updateLeaderboard: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IQuizRepository>;

    playerRepository = {
      findById: vi.fn(),
      listByQuizId: vi.fn(),
      findByQuizIdAndName: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateScore: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IPlayerRepository>;

    useCase = new GetPlayerSessionUseCase(quizRepository, playerRepository);
  });

  it('returns a player session DTO', async () => {
    const aggregate = buildAggregate();
    const player = new Player('player-1', 'Alice', 'quiz-1');

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.findById.mockImplementation(async (id) =>
      id === 'player-1' ? player : null
    );

    const result = await useCase.execute('quiz-1', 'player-1');

    expect(result.quiz.id).toBe('quiz-1');
    expect(result.player.id).toBe('player-1');
    expect(quizRepository.findById).toHaveBeenCalledWith('quiz-1');
    expect(playerRepository.findById).toHaveBeenCalledWith('player-1');
  });

  it('redacts question content and omits cross-player answers', async () => {
    const aggregate = buildAggregate();
    const player = new Player('player-1', 'Alice', 'quiz-1');

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.findById.mockImplementation(async (id) =>
      id === 'player-1' ? player : null
    );

    const result = await useCase.execute('quiz-1', 'player-1');

    expect(result.quiz.answers).toBeUndefined();
    expect(result.quiz.questions[0]?.text).toBe('');
    expect(result.quiz.questions[0]?.options).toBeUndefined();
  });

  it('throws if quiz is missing', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing', 'player-1')).rejects.toThrow(
      'Quiz with ID missing not found.'
    );
  });

  it('throws if player not part of quiz', async () => {
    const aggregate = buildAggregate();

    quizRepository.findById.mockResolvedValue(aggregate);

    await expect(useCase.execute('quiz-1', 'other')).rejects.toThrow(
      'Player other is not part of quiz quiz-1.'
    );
  });

  it('throws if player entity is missing', async () => {
    const aggregate = buildAggregate();

    quizRepository.findById.mockResolvedValue(aggregate);
    playerRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('quiz-1', 'player-1')).rejects.toThrow(
      'Player with ID player-1 not found.'
    );
  });
});
