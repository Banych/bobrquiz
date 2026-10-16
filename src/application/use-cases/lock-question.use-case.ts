import { IQuizRepository } from '@domain/repositories/quiz-repository';
import { IPlayerRepository } from '@domain/repositories/player-repository';
import { ILeaderboardSnapshotRepository } from '@domain/repositories/leaderboard-snapshot-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { RoundSummaryDTO } from '@application/dtos/round-summary.dto';
import { QuizStatus } from '@domain/entities/quiz';
import { AuditLog, AuditEventType } from '@domain/entities/audit-log';
import type { QuizSessionAggregate } from '@domain/aggregates/quiz-session-aggregate';
import type { Question } from '@domain/entities/question';
import type { Player } from '@domain/entities/player';
import type { Answer } from '@domain/entities/answer';
import { randomUUID } from 'crypto';

export class LockQuestionUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly playerRepository: IPlayerRepository,
    private readonly snapshotRepository: ILeaderboardSnapshotRepository,
    private readonly auditLogRepository?: IAuditLogRepository
  ) {}

  async execute(quizId: string): Promise<RoundSummaryDTO> {
    // 1. Load quiz and verify state
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz || quiz.quizStatus !== QuizStatus.Active) {
      throw new Error('Quiz is not active or does not exist.');
    }

    const currentQuestion = quiz.getCurrentQuestion();
    if (!currentQuestion) {
      throw new Error('No active question to lock.');
    }

    // 2. Lock the current question
    const lockedAt = quiz.lockCurrentQuestion();

    // Persist the lock first; losing the race means another request locked it
    const locked = await this.quizRepository.lockQuestion(
      quizId,
      currentQuestion.id,
      lockedAt
    );
    if (!locked) {
      throw new Error('Question already locked');
    }

    // 3. Get current leaderboard
    const currentLeaderboard = quiz.getLeaderboard();

    // 4. Get previous snapshots for rank comparison
    const previousQuestionIndex = quiz.currentQuestionIndex - 1;
    const previousSnapshots =
      previousQuestionIndex >= 0
        ? await this.snapshotRepository.findByQuizAndQuestion(
            quizId,
            previousQuestionIndex
          )
        : [];

    // 5. Save new snapshots
    await this.snapshotRepository.saveSnapshots(
      quizId,
      quiz.currentQuestionIndex,
      currentLeaderboard
    );

    // 6. Load all players for detailed results
    const players = await this.playerRepository.listByQuizId(quizId);
    const playerMap = new Map(players.map((p) => [p.id, p]));

    // 7. Build round summary
    const roundSummary = this.buildRoundSummary(
      quiz,
      currentQuestion,
      currentLeaderboard,
      previousSnapshots,
      playerMap,
      lockedAt
    );

    // 8. Persist locked state
    await this.quizRepository.save(quiz);

    if (this.auditLogRepository) {
      void this.auditLogRepository
        .save(
          new AuditLog(randomUUID(), AuditEventType.QuestionLocked, {
            quizId,
            metadata: {
              questionId: currentQuestion.id,
              questionIndex: quiz.currentQuestionIndex,
            },
          })
        )
        .catch((error) =>
          console.error('[AuditLog] lock-question save failed:', error)
        );
    }

    return roundSummary;
  }

  private buildRoundSummary(
    quiz: QuizSessionAggregate,
    currentQuestion: Question,
    currentLeaderboard: Array<{ playerId: string; score: number }>,
    previousSnapshots: Array<{
      playerId: string;
      score: number;
      rank: number;
    }>,
    playerMap: Map<string, Player>,
    lockedAt: Date
  ): RoundSummaryDTO {
    // Collect all answers for the current question from all players
    const allAnswers: Answer[] = [];
    for (const playerAnswers of quiz.answers.values()) {
      const questionAnswer = playerAnswers.find(
        (a: Answer) => a.questionId === currentQuestion.id
      );
      if (questionAnswer) {
        allAnswers.push(questionAnswer);
      }
    }
    const answerMap = new Map(allAnswers.map((a: Answer) => [a.playerId, a]));

    // Build player results
    const playerResults = Array.from(playerMap.values()).map((player) => {
      const answer = answerMap.get(player.id);
      return {
        playerId: player.id,
        playerName: player.name,
        answerSubmitted: !!answer,
        correct: answer?.isCorrect ?? false,
        timeTaken: answer?.timeTaken ?? null,
        pointsEarned: answer?.points ?? 0,
      };
    });

    // Calculate average time for players who answered
    const timeTakenValues = playerResults
      .filter((r) => r.timeTaken !== null)
      .map((r) => r.timeTaken!);
    const averageTime =
      timeTakenValues.length > 0
        ? timeTakenValues.reduce((sum, t) => sum + t, 0) /
          timeTakenValues.length
        : null;

    const correctCount = playerResults.filter((r) => r.correct).length;

    // Build leaderboard deltas
    const previousScoreMap = new Map(
      previousSnapshots.map((s) => [
        s.playerId,
        { score: s.score, rank: s.rank },
      ])
    );

    const leaderboardDeltas = currentLeaderboard.map((entry, index) => {
      const player = playerMap.get(entry.playerId);
      if (!player) {
        throw new Error(`Player ${entry.playerId} not found in playerMap`);
      }
      const currentRank = index + 1;
      const previous = previousScoreMap.get(entry.playerId);
      const previousRank = previous?.rank ?? null;
      const previousScore = previous?.score ?? null;
      const rankChange = previousRank ? previousRank - currentRank : 0;

      return {
        playerId: entry.playerId,
        playerName: player.name,
        previousRank,
        currentRank,
        rankChange,
        previousScore,
        currentScore: entry.score,
      };
    });

    return {
      questionId: currentQuestion.id,
      questionText: currentQuestion.text,
      correctAnswer: currentQuestion.correctAnswers[0],
      questionIndex: quiz.currentQuestionIndex,
      playerResults,
      averageTime,
      correctCount,
      totalPlayers: playerMap.size,
      leaderboardDeltas,
      lockedAt: lockedAt.toISOString(),
    };
  }
}
