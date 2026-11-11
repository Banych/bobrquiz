import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClientMock, getUserMock, isAdminUserMock } = vi.hoisted(
  () => ({
    createServerClientMock: vi.fn(),
    getUserMock: vi.fn(),
    isAdminUserMock: vi.fn(),
  })
);

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('@/infrastructure/auth/supabase-auth-client', () => ({
  isAdminUser: isAdminUserMock,
}));

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '@/proxy';

const makeRequest = (pathname: string) =>
  new NextRequest(`http://localhost:3000${pathname}`);

describe('proxy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
  });

  it('passes non-admin paths through without creating a Supabase client', async () => {
    const response = await proxy(makeRequest('/'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it('redirects an admin page to login when there is no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await proxy(makeRequest('/admin/quizzes'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?redirect=%2Fadmin%2Fquizzes'
    );
  });

  it('returns 401 JSON for an admin API call when there is no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await proxy(makeRequest('/api/admin/quizzes'));

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 for a non-allowlisted user on an admin page', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: 'x@example.com' } },
    });
    isAdminUserMock.mockReturnValue(false);

    const response = await proxy(makeRequest('/admin'));

    expect(isAdminUserMock).toHaveBeenCalledWith('x@example.com');
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Forbidden: Admin access required');
  });

  it('returns 403 JSON for a non-allowlisted user on an admin API call', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: 'x@example.com' } },
    });
    isAdminUserMock.mockReturnValue(false);

    const response = await proxy(makeRequest('/api/admin/x'));

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('lets an allowlisted user through', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: 'admin@example.com' } },
    });
    isAdminUserMock.mockReturnValue(true);

    const response = await proxy(makeRequest('/admin/quizzes'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('reads request cookies and forwards refreshed session cookies', async () => {
    type Cookie = { name: string; value: string; options?: { path?: string } };
    type ClientOptions = {
      cookies: {
        getAll: () => Cookie[];
        setAll: (cookies: Cookie[]) => void;
      };
    };
    let seenCookies: Cookie[] = [];
    createServerClientMock.mockImplementation(
      (_url: string, _key: string, options: ClientOptions) => ({
        auth: {
          getUser: async () => {
            seenCookies = options.cookies.getAll();
            options.cookies.setAll([
              {
                name: 'sb-session',
                value: 'refreshed',
                options: { path: '/' },
              },
            ]);
            return { data: { user: { email: 'admin@example.com' } } };
          },
        },
      })
    );
    isAdminUserMock.mockReturnValue(true);
    const request = makeRequest('/admin/quizzes');
    request.cookies.set('sb-session', 'stale');

    const response = await proxy(request);

    expect(seenCookies).toEqual([
      expect.objectContaining({ name: 'sb-session', value: 'stale' }),
    ]);
    expect(response.status).toBe(200);
    expect(response.cookies.get('sb-session')?.value).toBe('refreshed');
  });

  it('redirects an admin page to login when getUser throws', async () => {
    getUserMock.mockRejectedValue(new Error('boom'));

    const response = await proxy(makeRequest('/admin/quizzes'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?redirect=%2Fadmin%2Fquizzes'
    );
  });

  it('returns 401 JSON for an admin API call when getUser throws', async () => {
    getUserMock.mockRejectedValue(new Error('boom'));

    const response = await proxy(makeRequest('/api/admin/quizzes'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  describe('host pages', () => {
    const hostPages = ['/host', '/quiz/quiz-1', '/quiz/quiz-1/live'];

    it.each(hostPages)(
      'redirects %s to login when there is no user',
      async (pathname) => {
        getUserMock.mockResolvedValue({ data: { user: null } });

        const response = await proxy(makeRequest(pathname));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
          `http://localhost:3000/login?redirect=${encodeURIComponent(pathname)}`
        );
      }
    );

    it.each(hostPages)('lets an allowlisted user open %s', async (pathname) => {
      getUserMock.mockResolvedValue({
        data: { user: { email: 'admin@example.com' } },
      });
      isAdminUserMock.mockReturnValue(true);

      const response = await proxy(makeRequest(pathname));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('returns 403 for a non-allowlisted user on a host page', async () => {
      getUserMock.mockResolvedValue({
        data: { user: { email: 'x@example.com' } },
      });
      isAdminUserMock.mockReturnValue(false);

      const response = await proxy(makeRequest('/host'));

      expect(response.status).toBe(403);
    });

    it.each([
      '/join',
      '/play/quiz-1/player-1',
      '/api/quiz/quiz-1/state',
      '/hosting',
      '/quizzes',
    ])('leaves %s to the route without a Supabase client', async (pathname) => {
      const response = await proxy(makeRequest(pathname));

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(createServerClientMock).not.toHaveBeenCalled();
    });
  });

  describe('matcher', () => {
    const matches = (pathname: string) =>
      unstable_doesMiddlewareMatch({
        config,
        url: `http://localhost:3000${pathname}`,
      });

    // Everything Next sends to the proxy must get the login check: a path the matcher
    // sends but the proxy waves through would be a gap between the two
    it.each([
      '/admin',
      '/admin/quizzes',
      '/api/admin/quizzes',
      '/host',
      '/host/',
      '/quiz',
      '/quiz/quiz-1',
      '/quiz/quiz-1/live',
    ])('sends %s to the proxy, which checks the login', async (pathname) => {
      getUserMock.mockResolvedValue({ data: { user: null } });

      expect(matches(pathname)).toBe(true);
      const response = await proxy(makeRequest(pathname));
      expect(response.headers.get('x-middleware-next')).toBeNull();
      expect([307, 401]).toContain(response.status);
    });

    it.each([
      '/',
      '/join',
      '/play/quiz-1/player-1',
      '/api/quiz/quiz-1/state',
      '/api/player/answer',
      '/hosting',
      '/quizzes',
    ])('keeps %s away from the proxy', (pathname) => {
      expect(matches(pathname)).toBe(false);
    });
  });
});
