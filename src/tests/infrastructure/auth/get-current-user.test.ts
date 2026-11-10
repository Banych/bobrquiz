import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@infrastructure/auth/supabase-auth-client', () => ({
  createServerClient: mocks.createServerClient,
}));

import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

describe('getCurrentUserId', () => {
  const cookieStore = { getAll: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
  });

  it('returns the user id of the signed-in user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    await expect(getCurrentUserId()).resolves.toBe('user-1');
    expect(mocks.createServerClient).toHaveBeenCalledWith(cookieStore);
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
