import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IMediaStorage } from '@domain/repositories/media-storage';
import { quizMediaFolder } from '@domain/value-objects/media-file';

export class DeleteQuizUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly mediaStorage: IMediaStorage
  ) {}

  async execute(quizId: string): Promise<void> {
    const quiz = await this.quizRepository.findEntityById(quizId);
    if (!quiz) {
      throw new Error(`Quiz with ID ${quizId} not found`);
    }

    // Only allow deletion of pending/completed quizzes (not active)
    if (quiz.status === 'Active') {
      throw new Error('Cannot delete an active quiz');
    }

    // Files first: the per-host media cap counts only quizzes that exist, so
    // files left behind by a deleted quiz would escape it. If this fails the
    // quiz stays and the host can retry.
    await this.mediaStorage.removeFolder(quizMediaFolder(quizId));
    await this.quizRepository.delete(quizId);
  }
}
