export type StoredMediaFile = {
  /** File name inside its folder. */
  name: string;
  size: number;
  /** ISO timestamp; empty when storage does not report one. */
  createdAt: string;
};

/**
 * The `quiz-media` bucket, written to only by the server. Paths are relative
 * to the bucket (e.g. `questions/<quizId>/<file>`).
 */
export interface IMediaStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Removes one object; false when there was nothing at that path. */
  remove(path: string): Promise<boolean>;
  /** Files directly inside a folder (folder ends with `/`); sub-folders are skipped. */
  list(folder: string): Promise<StoredMediaFile[]>;
  /** The public URL players load the file from. Needs no credentials. */
  getPublicUrl(path: string): string;
}
