import type { IMediaStorage } from '@domain/repositories/media-storage';
import {
  isMediaFileName,
  quizMediaFolder,
} from '@domain/value-objects/media-file';

/**
 * A question's image must be a file in its own quiz's folder: an outside URL
 * would let a host log every player's IP, and another host's file breaks when
 * that host deletes it. Throws an "Invalid media" error otherwise.
 */
export const assertQuizMediaUrl = (
  storage: IMediaStorage,
  quizId: string,
  url: string
): void => {
  const prefix = storage.getPublicUrl(quizMediaFolder(quizId));
  const fileName = url.startsWith(prefix) ? url.slice(prefix.length) : '';

  if (!isMediaFileName(fileName)) {
    throw new Error(
      'Invalid media: the image must be a file uploaded to this quiz'
    );
  }
};
