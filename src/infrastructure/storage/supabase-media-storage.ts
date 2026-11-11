import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  IMediaStorage,
  StoredMediaFile,
} from '@domain/repositories/media-storage';

const BUCKET = 'quiz-media';
const LIST_LIMIT = 1000;

/** Supabase creates this marker for empty folders; it is not a user file. */
const FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

/**
 * The `quiz-media` bucket through the service-role key. The bucket's storage
 * policies no longer let a user session write, so every upload and delete
 * passes through here after the app's owner check.
 *
 * A missing key fails the request loudly instead of falling back to anything
 * (unlike the realtime server client, which returns null).
 */
export class SupabaseMediaStorage implements IMediaStorage {
  private client: SupabaseClient | null = null;

  private projectUrl(): string {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
    }
    return url.replace(/\/+$/, '');
  }

  private bucket() {
    if (!this.client) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) {
        console.error(
          '[media storage] SUPABASE_SERVICE_ROLE_KEY is not set; uploads and deletes fail'
        );
        throw new Error(
          'Media storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing)'
        );
      }
      this.client = createClient(this.projectUrl(), serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return this.client.storage.from(BUCKET);
  }

  async upload(
    path: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<void> {
    const { error } = await this.bucket().upload(path, bytes, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) {
      throw new Error(`Failed to upload media: ${error.message}`);
    }
  }

  async remove(path: string): Promise<boolean> {
    const { data, error } = await this.bucket().remove([path]);
    if (error) {
      throw new Error(`Failed to delete media: ${error.message}`);
    }
    return data.length > 0;
  }

  async list(folder: string): Promise<StoredMediaFile[]> {
    const { data, error } = await this.bucket().list(
      folder.replace(/\/+$/, ''),
      { limit: LIST_LIMIT, sortBy: { column: 'created_at', order: 'desc' } }
    );
    if (error) {
      throw new Error(`Failed to list media: ${error.message}`);
    }
    return data
      .filter((entry) => entry.id !== null && entry.name !== FOLDER_PLACEHOLDER)
      .map((entry) => ({
        name: entry.name,
        size: Number(entry.metadata?.size ?? 0),
        createdAt: entry.created_at ?? '',
      }));
  }

  getPublicUrl(path: string): string {
    return `${this.projectUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
  }
}
