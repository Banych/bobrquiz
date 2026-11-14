import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@infrastructure/auth/supabase-auth-client', () => ({
  createServerClient: mocks.createServerClient,
}));

import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

/** An unsigned access token with the given sign-in method in its `amr` claim. */
const tokenSignedInBy = (method: string) =>
  [
    'header',
    Buffer.from(
      JSON.stringify({ amr: [{ method, timestamp: 1794674785 }] })
    ).toString('base64url'),
    'signature',
  ].join('.');
const sessionSignedInBy = (method: string) => ({
  data: { session: { access_token: tokenSignedInBy(method) } },
  error: null,
});

describe('getCurrentUserId', () => {
  const cookieStore = { getAll: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    });
    mocks.getSession.mockResolvedValue(sessionSignedInBy('otp'));
  });

  it('returns the user id of the signed-in user', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: 'user-1', email_confirmed_at: '2026-11-14T10:00:00Z' },
      },
      error: null,
    });

    await expect(getCurrentUserId()).resolves.toBe('user-1');
    expect(mocks.createServerClient).toHaveBeenCalledWith(cookieStore);
  });

  it('returns null for a confirmed user signed in with a password', async () => {
    mocks.getSession.mockResolvedValue(sessionSignedInBy('password'));
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: 'user-1', email_confirmed_at: '2026-11-14T10:00:00Z' },
      },
      error: null,
    });

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it('returns null for a user whose email is not confirmed', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email_confirmed_at: null } },
      error: null,
    });

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it('returns null when nobody is signed in', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it('returns null on an auth error', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: { message: 'jwt expired' },
    });

    await expect(getCurrentUserId()).resolves.toBeNull();
  });
});
