import type { IDatabaseHealthRepository } from '@domain/repositories/database-health-repository';
import { prisma } from '@infrastructure/database/prisma/client';

export class PrismaDatabaseHealthRepository implements IDatabaseHealthRepository {
  async ping(): Promise<void> {
    // Reads an app table rather than `SELECT 1`: Supabase pauses free projects
    // with too little "user database activity", and a real table read is the
    // least ambiguous form of it
    await prisma.quiz.findFirst({ select: { id: true } });
  }
}
