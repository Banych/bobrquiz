import type {
  ILeaderboardSnapshotRepository,
  LeaderboardSnapshot,
} from '@domain/repositories/leaderboard-snapshot-repository';
import { prisma } from '@infrastructure/database/prisma/client';
import type { LeaderboardSnapshot as PrismaSnapshot } from '@infrastructure/database/prisma/generated-client';

const mapToDomain = (record: PrismaSnapshot): LeaderboardSnapshot => ({
  id: record.id,
  quizId: record.quizId,
  questionIndex: record.questionIndex,
  playerId: record.playerId,
  score: record.score,
  rank: record.rank,
  capturedAt: record.capturedAt,
});

export class PrismaLeaderboardSnapshotRepository implements ILeaderboardSnapshotRepository {
  async saveSnapshots(
    quizId: string,
    questionIndex: number,
    leaderboard: Array<{ playerId: string; score: number }>
  ): Promise<void> {
    // Create snapshots with ranks based on leaderboard order
    const snapshots = leaderboard.map((entry, index) => ({
      quizId,
      questionIndex,
      playerId: entry.playerId,
      score: entry.score,
      rank: index + 1,
    }));

    // Bulk insert snapshots
    await prisma.leaderboardSnapshot.createMany({
      data: snapshots,
    });
  }

  async findByQuizAndQuestion(
    quizId: string,
    questionIndex: number
  ): Promise<LeaderboardSnapshot[]> {
    const records = await prisma.leaderboardSnapshot.findMany({
      where: { quizId, questionIndex },
      orderBy: { rank: 'asc' },
    });
    return records.map(mapToDomain);
  }

  async findByQuizAndPlayer(
    quizId: string,
    playerId: string
  ): Promise<LeaderboardSnapshot[]> {
    const records = await prisma.leaderboardSnapshot.findMany({
      where: { quizId, playerId },
      orderBy: { questionIndex: 'asc' },
    });
    return records.map(mapToDomain);
  }

  async findByQuiz(quizId: string): Promise<LeaderboardSnapshot[]> {
    const records = await prisma.leaderboardSnapshot.findMany({
      where: { quizId },
      orderBy: [{ questionIndex: 'asc' }, { rank: 'asc' }],
    });
    return records.map(mapToDomain);
  }

  async deleteByQuiz(quizId: string): Promise<void> {
    await prisma.leaderboardSnapshot.deleteMany({
      where: { quizId },
    });
  }
}
