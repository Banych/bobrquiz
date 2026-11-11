import { randomUUID } from 'crypto';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IMediaStorage } from '@domain/repositories/media-storage';
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_FILES_PER_OWNER,
  detectImageType,
  makeMediaFileName,
  quizMediaFolder,
  quizMediaPath,
} from '@domain/value-objects/media-file';
import type { AssertQuizOwnerUseCase } from '@application/use-cases/assert-quiz-owner.use-case';
import type { MediaUploadResultDTO } from '@application/dtos/media.dto';

type UploadInput = { quizId: string; ownerId: string; bytes: Uint8Array };

const randomPart = () => randomUUID().replace(/-/g, '').slice(0, 12);

/**
 * Uploads a question image into the quiz's own folder. Only the quiz's owner
 * may upload (same not-found error as a missing quiz otherwise). Errors for
 * bad input start with "Invalid media" or "Media limit reached".
 */
export class UploadQuizMediaUseCase {
  constructor(
    private readonly quizRepository: IQuizRepository,
    private readonly storage: IMediaStorage,
    private readonly assertQuizOwner: AssertQuizOwnerUseCase,
    private readonly now: () => number = Date.now,
    private readonly random: () => string = randomPart
  ) {}

  async execute({
    quizId,
    ownerId,
    bytes,
  }: UploadInput): Promise<MediaUploadResultDTO> {
    await this.assertQuizOwner.execute(quizId, ownerId);

    if (bytes.length === 0) {
      throw new Error('Invalid media: the file is empty');
    }
    if (bytes.length > MAX_MEDIA_BYTES) {
      throw new Error('Invalid media: the file is larger than 4 MB');
    }
    const type = detectImageType(bytes);
    if (!type) {
      throw new Error('Invalid media: not a JPEG, PNG, GIF or WebP image');
    }

    await this.assertUnderCap(ownerId);

    const name = makeMediaFileName(type.extension, this.now(), this.random());
    const path = quizMediaPath(quizId, name);
    await this.storage.upload(path, bytes, type.contentType);

    return {
      url: this.storage.getPublicUrl(path),
      path,
      name,
      size: bytes.length,
    };
  }

  /** Two uploads at the same moment can pass the cap by one; accepted in the spec. */
  private async assertUnderCap(ownerId: string): Promise<void> {
    const quizzes = await this.quizRepository.listByOwner(ownerId);
    const folders = await Promise.all(
      quizzes.map((quiz) => this.storage.list(quizMediaFolder(quiz.id)))
    );
    const total = folders.reduce((sum, files) => sum + files.length, 0);
    if (total >= MAX_MEDIA_FILES_PER_OWNER) {
      throw new Error(
        `Media limit reached: a host can keep at most ${MAX_MEDIA_FILES_PER_OWNER} files`
      );
    }
  }
}
