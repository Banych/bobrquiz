import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  verifyEmailLink: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock('@infrastructure/auth/verify-email-link', () => ({
  verifyEmailLink: mocks.verifyEmailLink,
}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import ConfirmPage from '@/app/auth/confirm/page';
import { confirmSignIn } from '@/app/auth/confirm/actions';

const ORIGIN = 'http://localhost:3000';
const HASH = 'a1b2c3d4e5f6';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
};

const renderPage = async (params: Record<string, string>) =>
  renderToStaticMarkup(
    (await ConfirmPage({
      searchParams: Promise.resolve(params),
    })) as ReactElement
  );

describe('/auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: ORIGIN }));
    mocks.verifyEmailLink.mockResolvedValue({ ok: true });
  });

  describe('page (GET)', () => {
    it('renders a Continue form carrying the token hash and next, and verifies nothing', async () => {
      const html = await renderPage({
        token_hash: HASH,
        type: 'email',
        next: `${ORIGIN}/host`,
      });

      expect(html).toContain('Continue');
      expect(html).toContain(`name="token_hash" value="${HASH}"`);
      expect(html).toContain(`name="next" value="${ORIGIN}/host"`);
      expect(mocks.verifyEmailLink).not.toHaveBeenCalled();
    });

    it('explains a used or expired link and links back to sign-in', async () => {
      const html = await renderPage({ error: 'otp_expired' });

      expect(html).toContain('already used or has expired');
      expect(html).toContain('href="/login"');
      expect(html).not.toContain('Continue');
    });

    it('explains a link with no token hash', async () => {
      const html = await renderPage({});

      expect(html).toContain('Could not sign in with this link');
      expect(html).not.toContain('Continue');
    });
  });

  describe('confirmSignIn (POST)', () => {
    it('verifies the token hash and redirects to next as a path', async () => {
      await expect(
        confirmSignIn(
          form({ token_hash: HASH, next: `${ORIGIN}/quiz/q-1/live` })
        )
      ).rejects.toThrow('NEXT_REDIRECT /quiz/q-1/live');
      expect(mocks.verifyEmailLink).toHaveBeenCalledWith(HASH);
    });

    it.each([
      ['another site', 'https://evil.example/host'],
      ['the bare Site URL Supabase falls back to', ORIGIN],
      ['a protocol-relative trick', `${ORIGIN}/.//evil.example`],
      ['nothing', ''],
    ])('lands on /admin for %s', async (_label, next) => {
      await expect(
        confirmSignIn(form({ token_hash: HASH, next }))
      ).rejects.toThrow('NEXT_REDIRECT /admin');
    });

    it('lands on /admin for an absolute next when the request has no Origin', async () => {
      mocks.headers.mockResolvedValue(new Headers());

      await expect(
        confirmSignIn(form({ token_hash: HASH, next: `${ORIGIN}/host` }))
      ).rejects.toThrow('NEXT_REDIRECT /admin');
    });

    it('sends a used or expired link back to the page with its error code', async () => {
      mocks.verifyEmailLink.mockResolvedValue({
        ok: false,
        code: 'otp_expired',
      });

      await expect(
        confirmSignIn(form({ token_hash: HASH, next: `${ORIGIN}/host` }))
      ).rejects.toThrow('NEXT_REDIRECT /auth/confirm?error=otp_expired');
    });

    it.each([
      ['a missing token hash', {}],
      ['a token hash with other characters', { token_hash: 'abc&type=x' }],
      ['an overlong token hash', { token_hash: 'a'.repeat(129) }],
    ])('refuses %s without calling Supabase', async (_label, fields) => {
      await expect(confirmSignIn(form(fields))).rejects.toThrow(
        'NEXT_REDIRECT /auth/confirm?error=invalid_link'
      );
      expect(mocks.verifyEmailLink).not.toHaveBeenCalled();
    });
  });
});
