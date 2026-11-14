import { describe, it, expect } from 'vitest';
import { DEFAULT_REDIRECT, safeRedirectPath } from '@lib/safe-redirect';

describe('safeRedirectPath', () => {
  it('falls back to /admin', () => {
    expect(DEFAULT_REDIRECT).toBe('/admin');
  });

  it.each([
    ['/admin', '/admin'],
    ['/host', '/host'],
    ['/quiz/quiz-1/live', '/quiz/quiz-1/live'],
    ['/admin/quizzes?tab=all#top', '/admin/quizzes?tab=all#top'],
    ['/', '/'],
    ['/admin/../host', '/host'],
  ])('keeps the same-site path %s', (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it.each([
    ['nothing', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an absolute URL', 'https://evil.example/login'],
    ['a protocol-relative URL', '//evil.example/login'],
    ['a backslash host', '/\\evil.example'],
    ['a tab before the host', '/\t/evil.example'],
    ['a newline before the host', '/\n/evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,hi'],
    ['a relative path without a slash', 'admin'],
    ['a scheme with leading spaces', '  https://evil.example'],
    // Dot segments collapse during parsing and can leave a protocol-relative path behind
    ['a dot segment before the host', '/.//evil.example'],
    ['a parent segment before the host', '/..//evil.example'],
    ['a parent segment after a path', '/admin/..//evil.example'],
    ['two parent segments', '/a/../..//evil.example'],
    ['an encoded dot segment', '/%2e//evil.example'],
    ['an encoded parent segment', '/%2E%2E//evil.example'],
    ['a dot segment and a backslash', '/./\\evil.example'],
    ['a dot segment with a path and query', '/.//evil.example/x?y#z'],
  ])('falls back for %s', (_label, value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_REDIRECT);
  });

  describe("with this site's origin", () => {
    const origin = 'http://localhost:3000';

    it.each([
      ['http://localhost:3000/host', '/host'],
      ['http://localhost:3000/quiz/q-1/live?tab=x#y', '/quiz/q-1/live?tab=x#y'],
      ['http://localhost:3000/admin/../host', '/host'],
      ['/admin/quizzes', '/admin/quizzes'],
    ])('keeps %s as a path', (value, expected) => {
      expect(safeRedirectPath(value, origin)).toBe(expected);
    });

    it.each([
      ['another host', 'https://evil.example/host'],
      ['another port', 'http://localhost:3001/host'],
      ['another scheme', 'https://localhost:3000/host'],
      ['a lookalike host', 'http://localhost:3000.evil.example/host'],
      [
        'credentials before another host',
        'http://localhost:3000@evil.example/host',
      ],
      ['the bare origin Supabase falls back to', 'http://localhost:3000'],
      ['the bare origin with a slash', 'http://localhost:3000/'],
      [
        'a protocol-relative path after the origin',
        'http://localhost:3000//evil.example',
      ],
      [
        'a dot segment after the origin',
        'http://localhost:3000/.//evil.example',
      ],
      [
        'an encoded parent segment after the origin',
        'http://localhost:3000/%2E%2E//evil.example',
      ],
      ['a backslash after the origin', 'http://localhost:3000/\\evil.example'],
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a relative path without a slash', 'host'],
      ['a protocol-relative URL', '//evil.example/host'],
    ])('falls back for %s', (_label, value) => {
      expect(safeRedirectPath(value, origin)).toBe(DEFAULT_REDIRECT);
    });
  });
});
