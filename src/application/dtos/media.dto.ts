import { z } from 'zod';

export const MediaFileDTOSchema = z.object({
  name: z.string(),
  path: z.string(),
  url: z.string().url(),
  size: z.number(),
  createdAt: z.string(),
});
export type MediaFileDTO = z.infer<typeof MediaFileDTOSchema>;

export const MEDIA_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export type MediaContentType = (typeof MEDIA_ALLOWED_TYPES)[number];
export const MEDIA_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MEDIA_TOO_LARGE_MESSAGE = 'Image must be 4 MB or smaller';

export const UploadMediaInputSchema = z.object({
  quizId: z
    .string({ error: 'Invalid quiz ID' })
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid quiz ID'),
});
export type UploadMediaInputDTO = z.infer<typeof UploadMediaInputSchema>;

export const UploadMediaResultDTOSchema = z.object({
  url: z.string().url(),
  path: z.string(),
});
export type UploadMediaResultDTO = z.infer<typeof UploadMediaResultDTOSchema>;

export const DeleteMediaInputSchema = z.object({
  path: z.string({ error: 'Invalid media path' }).min(1, 'Invalid media path'),
});
export type DeleteMediaInputDTO = z.infer<typeof DeleteMediaInputSchema>;
