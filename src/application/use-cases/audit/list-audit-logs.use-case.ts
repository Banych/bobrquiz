import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import type { AuditLogDTO } from '@application/dtos/audit-log.dto';
import type { AuditLog } from '@domain/entities/audit-log';

const SUMMARY_MAP: Record<string, string> = {
  quiz_created: 'Quiz created',
  quiz_started: 'Quiz started',
  question_advanced: 'Question advanced',
  question_locked: 'Question locked',
};

const mapToDTO = (log: AuditLog): AuditLogDTO => ({
  id: log.id,
  quizId: log.quizId,
  eventType: log.eventType,
  summary: SUMMARY_MAP[log.eventType] ?? log.eventType,
  metadata: log.metadata,
  createdAt: log.createdAt.toISOString(),
});

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class ListAuditLogsUseCase {
  constructor(private readonly auditLogRepository: IAuditLogRepository) {}

  /**
   * Logs of the owner's quizzes only; another owner's quizId gives an empty
   * list, and logs with no quiz are not shown.
   */
  async execute(params: {
    ownerId: string;
    quizId?: string;
    limit?: number;
  }): Promise<AuditLogDTO[]> {
    const logs = await this.auditLogRepository.findForOwner(params.ownerId, {
      quizId: params.quizId,
      limit: Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    });
    return logs.map(mapToDTO);
  }
}
