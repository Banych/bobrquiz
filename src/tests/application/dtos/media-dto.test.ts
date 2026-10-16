import { describe, it, expect } from 'vitest';
import {
  UploadMediaInputSchema,
  DeleteMediaInputSchema,
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
} from '@application/dtos/media.dto';

describe('media DTOs', () => {
  it('pins the allowed types and the 4 MB limit', () => {
    expect(MEDIA_ALLOWED_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    expect(MEDIA_MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
  });

  it('accepts a plain quiz ID', () => {
    expect(UploadMediaInputSchema.parse({ quizId: 'cm1abc_X-9' })).toEqual({
      quizId: 'cm1abc_X-9',
    });
  });

  it.each(['', '../x', 'a/b', 'a b'])('rejects quizId %j', (quizId) => {
    const result = UploadMediaInputSchema.safeParse({ quizId });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Invalid quiz ID');
  });

  it('rejects a missing quizId with the same message', () => {
    const result = UploadMediaInputSchema.safeParse({});
    expect(result.error?.issues[0].message).toBe('Invalid quiz ID');
  });

  it('rejects an empty delete path', () => {
    expect(DeleteMediaInputSchema.safeParse({ path: '' }).success).toBe(false);
  });
});
