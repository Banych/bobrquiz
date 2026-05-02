import { SubmitAnswerUseCase } from '@application/use-cases/submit-answer.use-case';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Player } from '@domain/entities/player';
import { Question } from '@domain/entities/question';
import { Quiz } from '@domain/entities/quiz';
import { IPlayerRepository } from '@domain/repositories/player-repository';
import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';

describe('SubmitAnswerUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let submitAnswerUseCase: SubmitAnswerUseCase;

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
    submitAnswerUseCase = new SubmitAnswerUseCase(
      quizRepository,
      playerRepository
    );
  });

  it('should validate and save a correct answer', async () => {
    const question = new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10);
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [question], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      }),
      30
    );
    const player = new Player('p1', 'Player 1', 'quiz1');
    quiz.addPlayer(player.id);
    quiz.startQuiz();

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.findById.mockResolvedValue(player);

    await submitAnswerUseCase.execute(quiz.quizId, player.id, question.id, '4');

    expect(quizRepository.findById).toHaveBeenCalledWith(quiz.quizId);

    const answers = quiz.answers.get(player.id);
    expect(answers).toBeDefined();
    expect(answers?.length).toBe(1);
    expect(answers?.[0].questionId).toBe(question.id);
    expect(answers?.[0].value).toBe('4');
    expect(answers?.[0].isCorrect).toBe(true);

    const score = quiz.getLeaderboard().find((s) => s.playerId === 'p1');
    expect(score).toBeDefined();
    expect(score?.score).toBe(10);

    expect(quizRepository.save).toHaveBeenCalledWith(quiz);
  });

  it('should update player lastSeenAt on answer submission', async () => {
    const question = new Question('q1', 'What is 2 + 2?', ['4'], 'text', 10);
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [question], {
        timePerQuestion: 30,
        allowSkipping: true,
        scoringAlgorithm: 'FIXED',
      }),
      30
    );
    const player = new Player('p1', 'Player 1', 'quiz1');
    // Set lastSeenAt to a stale timestamp
    player.updateLastSeenAt(new Date('2020-01-01T00:00:00Z'));
    quiz.addPlayer(player.id);
    quiz.startQuiz();

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.findById.mockResolvedValue(player);

    const before = new Date();
    await submitAnswerUseCase.execute(quiz.quizId, player.id, question.id, '4');

    // lastSeenAt should have been refreshed to approximately now
    expect(player.lastSeenAt).not.toBeNull();
    expect(player.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(playerRepository.save).toHaveBeenCalledWith(player);
  });

  it('should throw an error if the quiz is not active', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz1', 'Sample Quiz', [], {
        timePerQuestion: 30,
        allowSkipping: true,
      }),
      30
    );

    quizRepository.findById.mockResolvedValue(quiz);

    await expect(
      submitAnswerUseCase.execute('quiz1', 'p1', 'q1', '4')
    ).rejects.toThrow('Quiz is not active or does not exist.');
    expect(quizRepository.save).not.toHaveBeenCalled();
  });
});
