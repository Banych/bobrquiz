/**
 * Rules for question images in the `quiz-media` bucket.
 *
 * A file belongs to the quiz whose folder it sits in (`questions/<quizId>/`),
 * so its owner is that quiz's owner. Spec:
 * docs/progress/plans/2026-11-11-quiz-media-owner-design.md
 */

/** Largest upload accepted; Vercel refuses request bodies over 4.5 MB. */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

/** Most files one host may keep across all of their quizzes. */
export const MAX_MEDIA_FILES_PER_OWNER = 200;

export type ImageType = {
  contentType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  extension: 'jpg' | 'png' | 'gif' | 'webp';
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * Detects the image type from the file's first bytes, never from the type the
 * browser declares. Returns null for anything that is not JPEG, PNG, GIF or WebP.
 */
export const detectImageType = (bytes: Uint8Array): ImageType | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (
    startsWith(bytes, ascii('GIF87a')) ||
    startsWith(bytes, ascii('GIF89a'))
  ) {
    return { contentType: 'image/gif', extension: 'gif' };
  }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return null;
};

/**
 * A media file name: `<timestamp>-<random>.<ext>`. Older browser uploads kept
 * the original extension (e.g. `jpeg`), so any short alphanumeric extension is
 * accepted. No slash and no `..` can match, so a name can never leave its folder.
 */
const MEDIA_FILE_NAME = /^\d{1,16}-[a-z0-9]{1,32}\.[A-Za-z0-9]{1,16}$/;

export const isMediaFileName = (name: string): boolean =>
  MEDIA_FILE_NAME.test(name);

export const makeMediaFileName = (
  extension: ImageType['extension'],
  now: number,
  random: string
): string => `${now}-${random}.${extension}`;

/** The folder holding a quiz's files, with a trailing slash. */
export const quizMediaFolder = (quizId: string): string =>
  `questions/${quizId}/`;

export const quizMediaPath = (quizId: string, fileName: string): string =>
  `${quizMediaFolder(quizId)}${fileName}`;
