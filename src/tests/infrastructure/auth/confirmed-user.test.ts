import { describe, it, expect } from 'vitest';
import { isConfirmedUser } from '@infrastructure/auth/confirmed-user';

describe('isConfirmedUser', () => {
  it('accepts a user whose email is confirmed', () => {
    expect(
      isConfirmedUser({ email_confirmed_at: '2026-11-14T10:00:00.000Z' })
    ).toBe(true);
  });

  it.each([
    ['a missing user', null],
    ['an undefined user', undefined],
    ['a user with no confirmation time', {}],
    ['a user with a null confirmation time', { email_confirmed_at: null }],
    ['a user with an empty confirmation time', { email_confirmed_at: '' }],
  ])('refuses %s', (_label, user) => {
    expect(isConfirmedUser(user)).toBe(false);
  });
});
