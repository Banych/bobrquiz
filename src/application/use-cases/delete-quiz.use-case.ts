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

    // The per-host media cap counts only quizzes that exist, so files left
    // behind by a deleted quiz would escape it.
    // - Files first: if that fails, the quiz stays and the host can retry.
    // - Again after the row is gone: an upload whose write landed in between
    //   is removed here; one that lands later finds the quiz gone and removes
    //   its own file (UploadQuizMediaUseCase).
    const folder = quizMediaFolder(quizId);
    await this.mediaStorage.removeFolder(folder);
    await this.quizRepository.delete(quizId);
    try {
      await this.mediaStorage.removeFolder(folder);
    } catch (error) {
      console.error(
        `[media] quiz ${quizId} deleted, but files written during the delete could not be removed from ${folder}`,
        error
      );
    }
  }
}
