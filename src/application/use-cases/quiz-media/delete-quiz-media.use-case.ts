import type { IMediaStorage } from '@domain/repositories/media-storage';
import {
  isMediaFileName,
  quizMediaPath,
} from '@domain/value-objects/media-file';
import type { AssertQuizOwnerUseCase } from '@application/use-cases/assert-quiz-owner.use-case';

type DeleteInput = { quizId: string; ownerId: string; fileName: string };

/**
 * Deletes one file from the quiz's own folder. The owner check runs first, so
 * a non-owner gets the same not-found error whatever name they send.
 */
export class DeleteQuizMediaUseCase {
  constructor(
    private readonly storage: IMediaStorage,
    private readonly assertQuizOwner: AssertQuizOwnerUseCase
  ) {}

  async execute({ quizId, ownerId, fileName }: DeleteInput): Promise<void> {
    await this.assertQuizOwner.execute(quizId, ownerId);

    if (!isMediaFileName(fileName)) {
      throw new Error('Invalid media: not a media file name');
    }

    const removed = await this.storage.remove(quizMediaPath(quizId, fileName));
    if (!removed) {
      throw new Error(`Media file not found: ${fileName}`);
    }
  }
}
