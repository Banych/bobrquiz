import type { IStorageService } from '@application/ports/storage-service';
import {
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_TOO_LARGE_MESSAGE,
  UploadMediaInputSchema,
  type MediaContentType,
  type UploadMediaResultDTO,
} from '@application/dtos/media.dto';
import { MediaValidationError } from './media-validation-error';

export type UploadMediaInput = {
  quizId: string;
  file: { bytes: ArrayBuffer; contentType: string; size: number };
};

const EXTENSIONS: Record<MediaContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const isAllowedType = (contentType: string): contentType is MediaContentType =>
  (MEDIA_ALLOWED_TYPES as readonly string[]).includes(contentType);

export class UploadMediaUseCase {
  constructor(private readonly storage: IStorageService) {}

  async execute({
    quizId,
    file,
  }: UploadMediaInput): Promise<UploadMediaResultDTO> {
    if (!UploadMediaInputSchema.safeParse({ quizId }).success) {
      throw new MediaValidationError('Invalid quiz ID');
    }
    if (!isAllowedType(file.contentType)) {
      throw new MediaValidationError('Image must be a JPEG, PNG, WebP or GIF');
    }
    if (file.size === 0) {
      throw new MediaValidationError('Image is empty');
    }
    if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
      throw new MediaValidationError(MEDIA_TOO_LARGE_MESSAGE);
    }

    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const path = `questions/${quizId}/${Date.now()}-${suffix}.${EXTENSIONS[file.contentType]}`;

    return this.storage.upload({
      path,
      body: file.bytes,
      contentType: file.contentType,
    });
  }
}
