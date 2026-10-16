import { LockQuestionUseCase } from '@application/use-cases/lock-question.use-case';
import { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import { Answer } from '@domain/entities/answer';
import { Player } from '@domain/entities/player';
import { Question } from '@domain/entities/question';
import { Quiz } from '@domain/entities/quiz';
import type { ILeaderboardSnapshotRepository } from '@domain/repositories/leaderboard-snapshot-repository';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditEventType } from '@domain/entities/audit-log';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';

describe('LockQuestionUseCase', () => {
  let quizRepository: Mocked<IQuizRepository>;
  let playerRepository: Mocked<IPlayerRepository>;
  let snapshotRepository: Mocked<ILeaderboardSnapshotRepository>;
  let useCase: LockQuestionUseCase;

  beforeEach(() => {
    quizRepository = {
      findById: vi.fn(),
      save: vi.fn(),
      findByJoinCode: vi.fn(),
      listByStatus: vi.fn(),
      updateCurrentQuestion: vi.fn(),
      updateLeaderboard: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findAll: vi.fn(),
      findEntityById: vi.fn(),
      lockQuestion: vi.fn().mockResolvedValue(true),
      clearQuestionLocks: vi.fn(),
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

    snapshotRepository = {
      saveSnapshots: vi.fn(),
      findByQuizAndQuestion: vi.fn(),
      findByQuizAndPlayer: vi.fn(),
      findByQuiz: vi.fn(),
      deleteByQuiz: vi.fn(),
    } as unknown as Mocked<ILeaderboardSnapshotRepository>;

    useCase = new LockQuestionUseCase(
      quizRepository,
      playerRepository,
      snapshotRepository
    );
  });

  const makeActiveQuiz = () => {
    const question = new Question(
      'q1',
      'What is 2+2?',
      ['4'],
      'multiple-choice',
      100,
      undefined,
      undefined,
      ['2', '3', '4', '5']
    );
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Math Quiz', [question], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.addPlayer('p1');
    quiz.startQuiz();
    return { quiz, question };
  };

  it('persists the lock before writing snapshots', async () => {
    const { quiz, question } = makeActiveQuiz();
    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.listByQuizId.mockResolvedValue([
      new Player('p1', 'Alice', 'quiz-1'),
    ]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    await useCase.execute('quiz-1');

    expect(quizRepository.lockQuestion).toHaveBeenCalledWith(
      'quiz-1',
      'q1',
      question.answersLockedAt
    );
    expect(question.answersLockedAt).toBeInstanceOf(Date);
    expect(
      quizRepository.lockQuestion.mock.invocationCallOrder[0]
    ).toBeLessThan(
      snapshotRepository.saveSnapshots.mock.invocationCallOrder[0]
    );
  });

  it('throws and writes nothing when another request locked the question first', async () => {
    const { quiz } = makeActiveQuiz();
    const auditLogRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      findByQuizId: vi.fn(),
      findRecent: vi.fn(),
    };
    quizRepository.findById.mockResolvedValue(quiz);
    quizRepository.lockQuestion.mockResolvedValue(false);
    playerRepository.listByQuizId.mockResolvedValue([]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    await expect(
      new LockQuestionUseCase(
        quizRepository,
        playerRepository,
        snapshotRepository,
        auditLogRepository
      ).execute('quiz-1')
    ).rejects.toThrow('Question already locked');
    expect(snapshotRepository.saveSnapshots).not.toHaveBeenCalled();
    expect(quizRepository.save).not.toHaveBeenCalled();
    expect(auditLogRepository.save).not.toHaveBeenCalled();
  });

  it('should lock current question and return round summary', async () => {
    // Setup quiz with active question
    const question1 = new Question(
      'q1',
      'What is 2+2?',
      ['4'],
      'multiple-choice',
      100,
      undefined,
      undefined,
      ['2', '3', '4', '5']
    );
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Math Quiz', [question1], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.addPlayer('p1');
    quiz.addPlayer('p2');
    quiz.startQuiz();

    // Setup players
    const player1 = new Player('p1', 'Alice', 'quiz-1');
    player1.updateScore(100);
    const player2 = new Player('p2', 'Bob', 'quiz-1');
    player2.updateScore(0);

    // Setup answers
    const answer1 = new Answer('a1', 'p1', 'q1', '4', new Date(), 5);
    answer1.markCorrect(100);
    const answer2 = new Answer('a2', 'p2', 'q1', '5', new Date(), 10);
    answer2.markIncorrect();
    quiz.answers.set('p1', [answer1]);
    quiz.answers.set('p2', [answer2]);

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.listByQuizId.mockResolvedValue([player1, player2]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    const result = await useCase.execute('quiz-1');

    expect(result).toMatchObject({
      questionId: 'q1',
      questionText: 'What is 2+2?',
      correctAnswer: '4',
      questionIndex: 0,
      totalPlayers: 2,
      correctCount: 1,
    });
    expect(result.playerResults).toHaveLength(2);
    expect(result.leaderboardDeltas).toHaveLength(2);
    expect(snapshotRepository.saveSnapshots).toHaveBeenCalledWith(
      'quiz-1',
      0,
      expect.any(Array)
    );
    expect(quizRepository.save).toHaveBeenCalledWith(quiz);
    expect(question1.answersLockedAt).toBeDefined();
  });

  it('should throw error if quiz is not found', async () => {
    quizRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('quiz-1')).rejects.toThrow(
      'Quiz is not active or does not exist.'
    );
    expect(snapshotRepository.saveSnapshots).not.toHaveBeenCalled();
  });

  it('should throw error if quiz is not active', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Test', [], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    // Quiz is in Pending state
    quizRepository.findById.mockResolvedValue(quiz);

    await expect(useCase.execute('quiz-1')).rejects.toThrow(
      'Quiz is not active or does not exist.'
    );
  });

  it('should throw error if no active question', async () => {
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Test', [], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.startQuiz();
    // Quiz is active but has no questions, so currentQuestion is null
    quizRepository.findById.mockResolvedValue(quiz);

    await expect(useCase.execute('quiz-1')).rejects.toThrow(
      'No active question to lock.'
    );
  });

  it('should calculate leaderboard deltas with rank changes', async () => {
    const question1 = new Question(
      'q1',
      'Question 1',
      ['A'],
      'multiple-choice',
      100
    );
    const question2 = new Question(
      'q2',
      'Question 2',
      ['B'],
      'multiple-choice',
      100
    );
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Test', [question1, question2], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.addPlayer('p1');
    quiz.addPlayer('p2');
    quiz.startQuiz();
    // Advance to question 2
    quiz.nextQuestion();

    // Setup answers to give p1 score of 150, p2 score of 100
    const answer1 = new Answer('a1', 'p1', 'q2', '4', new Date(), 5);
    answer1.markCorrect(150);
    const answer2 = new Answer('a2', 'p2', 'q2', '4', new Date(), 10);
    answer2.markCorrect(100);
    quiz.answers.set('p1', [answer1]);
    quiz.answers.set('p2', [answer2]);

    const player1 = new Player('p1', 'Alice', 'quiz-1');
    player1.updateScore(150); // Was rank 2, now rank 1
    const player2 = new Player('p2', 'Bob', 'quiz-1');
    player2.updateScore(100); // Was rank 1, now rank 2

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.listByQuizId.mockResolvedValue([player1, player2]);

    // Previous question snapshots (Bob was ahead after question 1)
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([
      {
        playerId: 'p2',
        score: 100,
        rank: 1,
        quizId: 'quiz-1',
        questionIndex: 0,
        capturedAt: new Date(),
      },
      {
        playerId: 'p1',
        score: 50,
        rank: 2,
        quizId: 'quiz-1',
        questionIndex: 0,
        capturedAt: new Date(),
      },
    ]);

    const result = await useCase.execute('quiz-1');

    const alice = result.leaderboardDeltas.find((d) => d.playerId === 'p1');
    const bob = result.leaderboardDeltas.find((d) => d.playerId === 'p2');

    expect(alice).toMatchObject({
      currentRank: 1,
      previousRank: 2,
      rankChange: 1, // Moved up 1 position
    });
    expect(bob).toMatchObject({
      currentRank: 2,
      previousRank: 1,
      rankChange: -1, // Moved down 1 position
    });
  });

  it('should handle first question with no previous snapshots', async () => {
    const question1 = new Question(
      'q1',
      'Question 1',
      ['A'],
      'multiple-choice',
      100
    );
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Test', [question1], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.addPlayer('p1');
    quiz.startQuiz();

    const answer1 = new Answer('a1', 'p1', 'q1', 'A', new Date(), 5);
    answer1.markCorrect(100);
    quiz.answers.set('p1', [answer1]);

    const player1 = new Player('p1', 'Alice', 'quiz-1');
    player1.updateScore(100);

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.listByQuizId.mockResolvedValue([player1]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    const result = await useCase.execute('quiz-1');

    expect(result.leaderboardDeltas[0]).toMatchObject({
      previousRank: null,
      currentRank: 1,
      rankChange: 0,
    });
  });

  describe('audit log emission', () => {
    let auditLogRepository: Mocked<IAuditLogRepository>;

    beforeEach(() => {
      auditLogRepository = {
        save: vi.fn().mockResolvedValue(undefined),
        findByQuizId: vi.fn(),
        findRecent: vi.fn(),
      };
    });

    it('saves an audit log with QuestionLocked event type', async () => {
      const question1 = new Question(
        'q1',
        'What is 2+2?',
        ['4'],
        'multiple-choice',
        100,
        undefined,
        undefined,
        ['2', '3', '4', '5']
      );
      const quiz = new QuizSessionAggregate(
        new Quiz('quiz-1', 'Math Quiz', [question1], {
          timePerQuestion: 30,
          allowSkipping: false,
        }),
        30
      );
      quiz.addPlayer('p1');
      quiz.startQuiz();

      const player1 = new Player('p1', 'Alice', 'quiz-1');
      quizRepository.findById.mockResolvedValue(quiz);
      playerRepository.listByQuizId.mockResolvedValue([player1]);
      snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

      const useCaseWithAudit = new LockQuestionUseCase(
        quizRepository,
        playerRepository,
        snapshotRepository,
        auditLogRepository
      );

      await useCaseWithAudit.execute('quiz-1');
      await new Promise((r) => setImmediate(r));

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: AuditEventType.QuestionLocked })
      );
    });

    it('does not propagate audit log save failures', async () => {
      const question1 = new Question(
        'q1',
        'What is 2+2?',
        ['4'],
        'multiple-choice',
        100,
        undefined,
        undefined,
        ['2', '3', '4', '5']
      );
      const quiz = new QuizSessionAggregate(
        new Quiz('quiz-1', 'Math Quiz', [question1], {
          timePerQuestion: 30,
          allowSkipping: false,
        }),
        30
      );
      quiz.addPlayer('p1');
      quiz.startQuiz();

      const player1 = new Player('p1', 'Alice', 'quiz-1');
      quizRepository.findById.mockResolvedValue(quiz);
      playerRepository.listByQuizId.mockResolvedValue([player1]);
      snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);
      auditLogRepository.save.mockRejectedValue(new Error('DB error'));

      const useCaseWithAudit = new LockQuestionUseCase(
        quizRepository,
        playerRepository,
        snapshotRepository,
        auditLogRepository
      );

      await expect(useCaseWithAudit.execute('quiz-1')).resolves.not.toThrow();
    });
  });

  it('should calculate average time correctly', async () => {
    const question1 = new Question(
      'q1',
      'Question 1',
      ['A'],
      'multiple-choice',
      100
    );
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Test', [question1], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.addPlayer('p1');
    quiz.addPlayer('p2');
    quiz.addPlayer('p3');
    quiz.startQuiz();

    const player1 = new Player('p1', 'Alice', 'quiz-1');
    const player2 = new Player('p2', 'Bob', 'quiz-1');
    const player3 = new Player('p3', 'Charlie', 'quiz-1');

    // Alice answered in 5s, Bob in 10s, Charlie didn't answer
    const answer1 = new Answer('a1', 'p1', 'q1', 'A', new Date(), 5);
    answer1.markCorrect(100);
    const answer2 = new Answer('a2', 'p2', 'q1', 'A', new Date(), 10);
    answer2.markCorrect(100);
    quiz.answers.set('p1', [answer1]);
    quiz.answers.set('p2', [answer2]);

    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.listByQuizId.mockResolvedValue([
      player1,
      player2,
      player3,
    ]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    const result = await useCase.execute('quiz-1');

    expect(result.averageTime).toBe(7.5); // (5 + 10) / 2
    expect(result.correctCount).toBe(2);
    expect(result.totalPlayers).toBe(3);
  });
});
