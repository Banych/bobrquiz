import { describe, it, expect } from 'vitest';
import { isValidImageType, isWithinUploadLimit } from '@lib/image-utils';
import { MEDIA_MAX_UPLOAD_BYTES } from '@application/dtos/media.dto';

const fileOf = (size: number, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], 'photo.png', { type });

describe('image-utils', () => {
  it('accepts the four image types and nothing else', () => {
    expect(isValidImageType(fileOf(1, 'image/gif'))).toBe(true);
    expect(isValidImageType(fileOf(1, 'image/svg+xml'))).toBe(false);
  });

  it('accepts a file under the upload limit', () => {
    expect(isWithinUploadLimit(fileOf(1))).toBe(true);
  });

  it('accepts a file at the upload limit', () => {
    expect(isWithinUploadLimit(fileOf(MEDIA_MAX_UPLOAD_BYTES))).toBe(true);
  });

  it('rejects a file one byte over the upload limit', () => {
    expect(isWithinUploadLimit(fileOf(MEDIA_MAX_UPLOAD_BYTES + 1))).toBe(false);
  });
});
