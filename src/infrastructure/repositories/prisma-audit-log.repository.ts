import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditLog, AuditEventType } from '@domain/entities/audit-log';
import { prisma } from '@infrastructure/database/prisma/client';
import type { AuditLog as PrismaAuditLog } from '@infrastructure/database/prisma/generated-client';

const mapToDomain = (record: PrismaAuditLog): AuditLog =>
  new AuditLog(record.id, record.eventType as AuditEventType, {
    quizId: record.quizId ?? undefined,
    actorId: record.actorId ?? undefined,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    createdAt: record.createdAt,
  });

export class PrismaAuditLogRepository implements IAuditLogRepository {
  async save(log: AuditLog): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: log.id,
        quizId: log.quizId ?? null,
        actorId: log.actorId ?? null,
        eventType: log.eventType,
        metadata: log.metadata as object,
        createdAt: log.createdAt,
      },
    });
  }

  async findForOwner(
    ownerId: string,
    { quizId, limit = 100 }: { quizId?: string; limit?: number } = {}
  ): Promise<AuditLog[]> {
    const records = await prisma.auditLog.findMany({
      where: {
        quiz: { is: { ownerId } },
        ...(quizId ? { quizId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map(mapToDomain);
  }
}
