import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHostUser,
  isConfirmedUser,
  isHostSession,
  signInMethods,
} from '@infrastructure/auth/confirmed-user';

/** An unsigned access token whose payload carries `amr`, as Supabase's tokens do. */
const tokenWith = (amr: unknown) =>
  [
    'header',
    Buffer.from(JSON.stringify({ sub: 'u-1', amr })).toString('base64url'),
    'signature',
  ].join('.');

const at = (method: string) => [{ method, timestamp: 1794674785 }];
const OTP_TOKEN = tokenWith(at('otp'));
const PASSWORD_TOKEN = tokenWith(at('password'));
const confirmed = { id: 'u-1', email_confirmed_at: '2026-11-14T10:00:00.000Z' };

describe('isConfirmedUser', () => {
  it('accepts a user whose email is confirmed', () => {
    expect(isConfirmedUser(confirmed)).toBe(true);
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

describe('signInMethods', () => {
  it('reads the methods from Supabase-style amr entries', () => {
    expect(signInMethods(tokenWith([...at('password'), ...at('otp')]))).toEqual(
      ['password', 'otp']
    );
  });

  it('reads plain string entries (RFC 8176 form)', () => {
    expect(signInMethods(tokenWith(['otp']))).toEqual(['otp']);
  });

  it('decodes base64url characters in the payload', () => {
    // A payload long enough to contain '-' or '_' after encoding
    const token = tokenWith([{ method: 'otp', note: '>>>???~~~' }]);
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(signInMethods(token)).toEqual(['otp']);
  });

  it.each([
    ['no token', undefined],
    ['an empty token', ''],
    ['a token with no payload', 'header'],
    ['a payload that is not base64', 'h.%%%.s'],
    [
      'a payload that is not JSON',
      `h.${Buffer.from('nope').toString('base64url')}.s`,
    ],
    ['no amr claim', tokenWith(undefined)],
    ['an amr that is not a list', tokenWith('otp')],
    ['entries with no method', tokenWith([{ timestamp: 1 }, null, 42])],
  ])('returns no methods for %s', (_label, token) => {
    expect(signInMethods(token)).toEqual([]);
  });
});

describe('isHostSession', () => {
  it.each([
    ['the emailed code or link', OTP_TOKEN],
    ['a Supabase magic link', tokenWith(at('magiclink'))],
  ])('accepts a confirmed user signed in by %s', (_label, token) => {
    expect(isHostSession(confirmed, token)).toBe(true);
  });

  it.each([
    ['a password', PASSWORD_TOKEN],
    ['a password recovery link', tokenWith(at('recovery'))],
    ['an OAuth provider', tokenWith(at('oauth'))],
    ['a token with no amr', tokenWith(undefined)],
    ['no token', undefined],
  ])('refuses a confirmed user signed in by %s', (_label, token) => {
    expect(isHostSession(confirmed, token)).toBe(false);
  });

  it('refuses an unconfirmed user even with an email sign-in', () => {
    expect(isHostSession({ email_confirmed_at: null }, OTP_TOKEN)).toBe(false);
  });
});

describe('getHostUser', () => {
  const auth = { getSession: vi.fn(), getUser: vi.fn() };
  const session = (accessToken: string) => ({
    data: { session: { access_token: accessToken } },
    error: null,
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the user the auth server verified for the session token', async () => {
    auth.getSession.mockResolvedValue(session(OTP_TOKEN));
    auth.getUser.mockResolvedValue({ data: { user: confirmed }, error: null });

    await expect(getHostUser(auth as never)).resolves.toBe(confirmed);
    expect(auth.getUser).toHaveBeenCalledWith(OTP_TOKEN);
  });

  it('returns null for a password session of a confirmed user', async () => {
    auth.getSession.mockResolvedValue(session(PASSWORD_TOKEN));
    auth.getUser.mockResolvedValue({ data: { user: confirmed }, error: null });

    await expect(getHostUser(auth as never)).resolves.toBeNull();
  });

  it('returns null with no session, without asking the auth server', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(getHostUser(auth as never)).resolves.toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('returns null when the auth server rejects the token', async () => {
    auth.getSession.mockResolvedValue(session(OTP_TOKEN));
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });

    await expect(getHostUser(auth as never)).resolves.toBeNull();
  });

  it('returns null for an unconfirmed user', async () => {
    auth.getSession.mockResolvedValue(session(OTP_TOKEN));
    auth.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email_confirmed_at: null } },
      error: null,
    });

    await expect(getHostUser(auth as never)).resolves.toBeNull();
  });
});
