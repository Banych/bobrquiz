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
  ])('falls back for %s', (_label, value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_REDIRECT);
  });
});
