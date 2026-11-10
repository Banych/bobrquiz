import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogEventUseCase } from '@application/use-cases/audit/log-event.use-case';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditEventType } from '@domain/entities/audit-log';

const mockAuditRepo: IAuditLogRepository = {
  save: vi.fn(),
  findForOwner: vi.fn(),
};

describe('LogEventUseCase', () => {
  let useCase: LogEventUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new LogEventUseCase(mockAuditRepo);
  });

  it('saves an audit log with the given event type', async () => {
    await useCase.execute({ eventType: AuditEventType.QuizCreated });
    expect(mockAuditRepo.save).toHaveBeenCalledOnce();
    const saved = vi.mocked(mockAuditRepo.save).mock.calls[0][0];
    expect(saved.eventType).toBe(AuditEventType.QuizCreated);
    expect(saved.id).toBeTruthy();
  });

  it('passes quizId and metadata', async () => {
    await useCase.execute({
      eventType: AuditEventType.QuizStarted,
      quizId: 'quiz-1',
      metadata: { title: 'Test' },
    });
    const saved = vi.mocked(mockAuditRepo.save).mock.calls[0][0];
    expect(saved.quizId).toBe('quiz-1');
    expect(saved.metadata).toEqual({ title: 'Test' });
  });

  it('defaults metadata to empty object when not provided', async () => {
    await useCase.execute({ eventType: AuditEventType.QuestionLocked });
    const saved = vi.mocked(mockAuditRepo.save).mock.calls[0][0];
    expect(saved.metadata).toEqual({});
  });
});
