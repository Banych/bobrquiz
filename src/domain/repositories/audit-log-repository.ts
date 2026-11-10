import type { AuditLog } from '@domain/entities/audit-log';

export interface IAuditLogRepository {
  save(log: AuditLog): Promise<void>;
  /**
   * Newest first, only logs whose quiz the owner owns. Logs with no quiz (for
   * example after the quiz was deleted) are never returned.
   */
  findForOwner(
    ownerId: string,
    options?: { quizId?: string; limit?: number }
  ): Promise<AuditLog[]>;
}
