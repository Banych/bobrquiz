import { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IAuditLogRepository } from '@domain/repositories/audit-log-repository';
import { AuditLog, AuditEventType } from '@domain/entities/audit-log';
import { randomUUID } from 'crypto';

export class StartQuizUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly auditLogRepository?: IAuditLogRepository
  ) {}

  async execute(quizId: string): Promise<void> {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found.');
    }

    quiz.startQuiz();
    await this.quizRepository.clearQuestionLocks(quizId);

    await this.quizRepository.save(quiz);

    if (this.auditLogRepository) {
      void this.auditLogRepository
        .save(
          new AuditLog(randomUUID(), AuditEventType.QuizStarted, { quizId })
        )
        .catch((error) =>
          console.error('[AuditLog] start-quiz save failed:', error)
        );
    }
  }
}
