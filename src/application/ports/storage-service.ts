/**
 * Port for the media store. Implemented in infrastructure; the bucket is
 * fixed by the implementation.
 */
export type StoredObject = { path: string; url: string };

export type StorageListEntry = {
  name: string;
  path: string;
  size: number;
  createdAt: string;
};

export interface IStorageService {
  upload(input: {
    path: string;
    body: ArrayBuffer;
    contentType: string;
  }): Promise<StoredObject>;
  delete(path: string): Promise<void>;
  list(prefix?: string): Promise<StorageListEntry[]>;
  getPublicUrl(path: string): string;
}
