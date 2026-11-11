import { randomUUID } from 'crypto';
import type { IQuizRepository } from '@domain/repositories/quiz-repository';
import type { IMediaStorage } from '@domain/repositories/media-storage';
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_BYTES_PER_OWNER,
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

    const before = await this.usage(ownerId);
    if (overCap(before.files + 1, before.bytes + bytes.length)) {
      throw limitReached();
    }

    const name = makeMediaFileName(type.extension, this.now(), this.random());
    const path = quizMediaPath(quizId, name);
    await this.storage.upload(path, bytes, type.contentType);

    // Uploads running at the same moment all pass the first check. Counting
    // again after the write, with this file included, catches them: each one
    // over the cap removes its own file, so the cap holds once they finish.
    const after = await this.usage(ownerId);
    if (overCap(after.files, after.bytes)) {
      await this.storage.remove(path);
      throw limitReached();
    }

    return {
      url: this.storage.getPublicUrl(path),
      path,
      name,
      size: bytes.length,
    };
  }

  /** Files and bytes across the folders of every quiz the host owns. */
  private async usage(
    ownerId: string
  ): Promise<{ files: number; bytes: number }> {
    const quizzes = await this.quizRepository.listByOwner(ownerId);
    const folders = await Promise.all(
      quizzes.map((quiz) => this.storage.list(quizMediaFolder(quiz.id)))
    );
    const all = folders.flat();
    return {
      files: all.length,
      bytes: all.reduce((sum, file) => sum + file.size, 0),
    };
  }
}

const overCap = (files: number, bytes: number) =>
  files > MAX_MEDIA_FILES_PER_OWNER || bytes > MAX_MEDIA_BYTES_PER_OWNER;

const limitReached = () =>
  new Error(
    `Media limit reached: a host can keep at most ${MAX_MEDIA_FILES_PER_OWNER} files and ${
      MAX_MEDIA_BYTES_PER_OWNER / (1024 * 1024)
    } MB`
  );
