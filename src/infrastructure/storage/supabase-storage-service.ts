import type {
  IStorageService,
  StorageListEntry,
  StoredObject,
} from '@application/ports/storage-service';
import { getSupabaseServerClient } from '@infrastructure/realtime/supabase-server-client';

const BUCKET = 'quiz-media';
const FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

/**
 * Service-role adapter for the media store. The client is resolved per call,
 * so a missing key fails the call rather than the import.
 */
export class SupabaseStorageService implements IStorageService {
  private bucket() {
    const client = getSupabaseServerClient();
    if (!client) throw new Error('Storage is not configured');
    return client.storage.from(BUCKET);
  }

  async upload(input: {
    path: string;
    body: ArrayBuffer;
    contentType: string;
  }): Promise<StoredObject> {
    const bucket = this.bucket();
    const { error } = await bucket.upload(input.path, input.body, {
      contentType: input.contentType,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    return {
      path: input.path,
      url: bucket.getPublicUrl(input.path).data.publicUrl,
    };
  }

  async delete(path: string): Promise<void> {
    const { data, error } = await this.bucket().remove([path]);
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`Media file ${path} not found`);
    }
  }

  async list(prefix?: string): Promise<StorageListEntry[]> {
    const { data, error } = await this.bucket().list(prefix ?? '', {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) throw error;
    return (data ?? [])
      .filter((f) => f.name !== FOLDER_PLACEHOLDER)
      .map((f) => ({
        name: f.name,
        path: prefix ? `${prefix}/${f.name}` : f.name,
        size: f.metadata?.size ?? 0,
        createdAt: f.created_at ?? new Date().toISOString(),
      }));
  }

  getPublicUrl(path: string): string {
    return this.bucket().getPublicUrl(path).data.publicUrl;
  }
}
