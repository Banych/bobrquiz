import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import { JoinSessionUseCase } from '@application/use-cases/join-session.use-case';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import { Quiz } from '@domain/entities/quiz';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Question } from '@domain/entities/question';
import { Player } from '@domain/entities/player';

const buildAggregate = () => {
  const quiz = new Quiz(
    'quiz-123',
    'Sample Quiz',
    [
      new Question(
        'question-1',
        'What is 2 + 2?',
        ['4'],
        'multiple-choice',
        100,
        undefined,
        undefined,
        ['3', '4']
      ),
    ],
    { timePerQuestion: 30, allowSkipping: false }
  );

  const aggregate = new QuizSessionAggregate(quiz, 30);
  aggregate.joinCode = 'JOIN123';
  aggregate.addPlayer('player-1');
  return aggregate;
};

describe('JoinSessionUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let useCase: JoinSessionUseCase;

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

    useCase = new JoinSessionUseCase(quizRepository, playerRepository);
  });

  it('returns quiz DTO when join code matches a quiz', async () => {
    const aggregate = buildAggregate();
    const player = new Player('player-1', 'Alice', 'quiz-123');

    quizRepository.findByJoinCode.mockResolvedValue(aggregate);
    playerRepository.findById.mockResolvedValue(player);

    const result = await useCase.execute('JOIN123');

    expect(result.id).toBe('quiz-123');
    expect(result.players[0]?.id).toBe('player-1');
    expect(quizRepository.findByJoinCode).toHaveBeenCalledWith('JOIN123');
  });

  it('redacts question content and omits cross-player answers', async () => {
    const aggregate = buildAggregate();
    const player = new Player('player-1', 'Alice', 'quiz-123');

    quizRepository.findByJoinCode.mockResolvedValue(aggregate);
    playerRepository.findById.mockResolvedValue(player);

    const result = await useCase.execute('JOIN123');

    expect(result.answers).toBeUndefined();
    // No question has been started yet, so the single question is redacted
    expect(result.questions[0]?.text).toBe('');
    expect(result.questions[0]?.options).toBeUndefined();
  });

  it('throws when join code is missing', async () => {
    await expect(useCase.execute('')).rejects.toThrow('Join code is required.');
  });

  it('throws when quiz is not found', async () => {
    quizRepository.findByJoinCode.mockResolvedValue(null);

    await expect(useCase.execute('MISSING')).rejects.toThrow(
      'Quiz with the provided join code was not found.'
    );
  });
});
