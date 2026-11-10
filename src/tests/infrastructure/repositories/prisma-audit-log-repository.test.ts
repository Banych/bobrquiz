import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaAuditLogRepository } from '@infrastructure/repositories/prisma-audit-log.repository';
import { AuditEventType } from '@domain/entities/audit-log';

const auditLogMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { auditLog: auditLogMocks },
}));

describe('PrismaAuditLogRepository.findForOwner', () => {
  const repository = new PrismaAuditLogRepository();

  beforeEach(() => {
    vi.resetAllMocks();
    auditLogMocks.findMany.mockResolvedValue([]);
  });

  it("filters on the quiz's owner in the query, newest first, default limit 100", async () => {
    await repository.findForOwner('owner-1');

    // Filtering through the relation also drops logs whose quizId is null.
    expect(auditLogMocks.findMany).toHaveBeenCalledWith({
      where: { quiz: { is: { ownerId: 'owner-1' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('adds the quizId filter alongside the owner filter, never instead of it', async () => {
    await repository.findForOwner('owner-1', { quizId: 'quiz-9', limit: 5 });

    expect(auditLogMocks.findMany).toHaveBeenCalledWith({
      where: { quiz: { is: { ownerId: 'owner-1' } }, quizId: 'quiz-9' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  });

  it('maps records to domain logs', async () => {
    const createdAt = new Date('2026-11-10T10:00:00Z');
    auditLogMocks.findMany.mockResolvedValue([
      {
        id: 'log-1',
        quizId: 'quiz-1',
        actorId: null,
        eventType: 'quiz_created',
        metadata: { title: 'Mine' },
        createdAt,
      },
    ]);

    const [log] = await repository.findForOwner('owner-1');

    expect(log).toMatchObject({
      id: 'log-1',
      quizId: 'quiz-1',
      actorId: undefined,
      eventType: AuditEventType.QuizCreated,
      metadata: { title: 'Mine' },
      createdAt,
    });
  });
});
