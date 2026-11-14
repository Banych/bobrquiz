import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@infrastructure/auth/supabase-auth-client', () => ({
  createServerClient: mocks.createServerClient,
}));

import { verifyEmailLink } from '@infrastructure/auth/verify-email-link';

describe('verifyEmailLink', () => {
  const cookieStore = { getAll: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockResolvedValue({
      auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut },
    });
  });

  it('verifies the token hash as type email through the cookie-aware client', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: 'u-1', email_confirmed_at: '2026-11-14T10:00:00Z' } },
      error: null,
    });

    await expect(verifyEmailLink('abc123')).resolves.toEqual({ ok: true });
    expect(mocks.createServerClient).toHaveBeenCalledWith(cookieStore);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'abc123',
      type: 'email',
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('returns the Supabase error code for a used or expired link', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'otp_expired',
        message: 'Email link is invalid or has expired',
      },
    });

    await expect(verifyEmailLink('abc123')).resolves.toEqual({
      ok: false,
      code: 'otp_expired',
    });
  });

  it('returns unknown for an error without a code', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'fetch failed' },
    });

    await expect(verifyEmailLink('abc123')).resolves.toEqual({
      ok: false,
      code: 'unknown',
    });
  });

  it('signs an unconfirmed user out again', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: 'u-1', email_confirmed_at: null } },
      error: null,
    });

    await expect(verifyEmailLink('abc123')).resolves.toEqual({
      ok: false,
      code: 'email_not_confirmed',
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
