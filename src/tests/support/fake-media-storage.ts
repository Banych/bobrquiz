import type {
  IMediaStorage,
  StoredMediaFile,
} from '@domain/repositories/media-storage';

export const FAKE_MEDIA_BASE =
  'https://project.supabase.test/storage/v1/object/public/quiz-media/';

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  createdAt: string;
};

/** In-memory `quiz-media` bucket for use case and route tests. */
export class FakeMediaStorage implements IMediaStorage {
  readonly objects = new Map<string, StoredObject>();
  private clock = 0;

  /** Puts a file straight into the bucket, as an older upload would have. */
  seed(path: string, size = 10): void {
    this.objects.set(path, {
      bytes: new Uint8Array(size),
      contentType: 'image/jpeg',
      createdAt: new Date(
        Date.UTC(2026, 0, 1, 0, 0, this.clock++)
      ).toISOString(),
    });
  }

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    if (this.objects.has(path)) {
      throw new Error('Failed to upload media: The resource already exists');
    }
    this.objects.set(path, {
      bytes,
      contentType,
      createdAt: new Date(
        Date.UTC(2026, 0, 1, 0, 0, this.clock++)
      ).toISOString(),
    });
  }

  async remove(path: string) {
    return this.objects.delete(path);
  }

  async list(folder: string): Promise<StoredMediaFile[]> {
    return [...this.objects.entries()]
      .filter(([path]) => {
        if (!path.startsWith(folder)) return false;
        return !path.slice(folder.length).includes('/');
      })
      .map(([path, object]) => ({
        name: path.slice(folder.length),
        size: object.bytes.length,
        createdAt: object.createdAt,
      }));
  }

  getPublicUrl(path: string) {
    return `${FAKE_MEDIA_BASE}${path}`;
  }
}
