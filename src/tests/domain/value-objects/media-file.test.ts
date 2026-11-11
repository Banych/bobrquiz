import { describe, it, expect } from 'vitest';
import {
  detectImageType,
  isMediaFileName,
  makeMediaFileName,
  quizMediaFolder,
  quizMediaPath,
} from '@domain/value-objects/media-file';

const bytesOf = (...parts: Array<number[] | string>) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string'
        ? [...part].map((char) => char.charCodeAt(0))
        : part
    )
  );

describe('detectImageType', () => {
  it('reads JPEG, PNG, GIF and WebP from their first bytes', () => {
    expect(detectImageType(bytesOf([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg',
    });
    expect(
      detectImageType(
        bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
      )
    ).toEqual({ contentType: 'image/png', extension: 'png' });
    expect(detectImageType(bytesOf('GIF87a', [0]))?.extension).toBe('gif');
    expect(detectImageType(bytesOf('GIF89a', [0]))?.extension).toBe('gif');
    expect(detectImageType(bytesOf('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toEqual({
      contentType: 'image/webp',
      extension: 'webp',
    });
  });

  it('refuses anything else, whatever it claims to be', () => {
    expect(detectImageType(bytesOf('<html><script>'))).toBeNull();
    expect(detectImageType(bytesOf('<svg xmlns="'))).toBeNull();
    expect(
      detectImageType(bytesOf('RIFF', [1, 2, 3, 4], 'WAVEfmt '))
    ).toBeNull();
    expect(detectImageType(bytesOf([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('media file names', () => {
  it('accepts the server-made shape and older browser uploads', () => {
    expect(
      isMediaFileName(makeMediaFileName('png', 1731300000000, 'ab12'))
    ).toBe(true);
    expect(isMediaFileName('1731300000000-k3j4h5g6f7d8s.jpeg')).toBe(true);
    expect(isMediaFileName('1731300000000-k3j4h5g6f7d8s.JPG')).toBe(true);
  });

  it('refuses anything that could leave the folder or is not a media name', () => {
    for (const name of [
      '',
      '../1731300000000-ab.png',
      '1731300000000-ab.png/x',
      'questions/quiz-1/1731300000000-ab.png',
      '1731300000000-ab..png',
      '1731300000000-AB.png',
      'photo.png',
      '1731300000000-ab',
      '1731300000000-ab.png ',
    ]) {
      expect(isMediaFileName(name), name).toBe(false);
    }
  });

  it('places files in the quiz folder', () => {
    expect(quizMediaFolder('quiz-1')).toBe('questions/quiz-1/');
    expect(quizMediaPath('quiz-1', '1-a.png')).toBe('questions/quiz-1/1-a.png');
  });
});
