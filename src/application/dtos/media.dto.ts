import { z } from 'zod';

export { MAX_MEDIA_BYTES } from '@domain/value-objects/media-file';

export const MediaFileDTOSchema = z.object({
  name: z.string(),
  path: z.string(),
  url: z.string().url(),
  size: z.number(),
  createdAt: z.string(),
});
export type MediaFileDTO = z.infer<typeof MediaFileDTOSchema>;

/** A file in the signed-in host's media library, with the quiz it belongs to. */
export const OwnerMediaFileDTOSchema = MediaFileDTOSchema.extend({
  quizId: z.string(),
  quizTitle: z.string(),
});
export type OwnerMediaFileDTO = z.infer<typeof OwnerMediaFileDTOSchema>;

export const MediaUploadResultDTOSchema = z.object({
  url: z.url(),
  path: z.string(),
  name: z.string(),
  size: z.number(),
});
export type MediaUploadResultDTO = z.infer<typeof MediaUploadResultDTOSchema>;
