'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyEmailLink } from '@infrastructure/auth/verify-email-link';
import { safeRedirectPath } from '@/lib/safe-redirect';

// Supabase's token hash is hex (a PKCE one has a `pkce_` prefix); anything else is not a link
// Supabase sent, so it never reaches the auth server
const TOKEN_HASH = /^[\w-]{1,128}$/;

const confirmError = (code: string): never =>
  redirect(`/auth/confirm?error=${encodeURIComponent(code)}`);

/**
 * The confirm page's Continue button: verifies the email link's token hash, which sets the
 * session cookie, then sends the host on to the link's `next`. `next` is an absolute URL
 * (the email template's `{{ .RedirectTo }}`), so only a URL on the origin this request came from
 * is followed, reduced to its path; anything else lands on `/admin`.
 */
export async function confirmSignIn(formData: FormData): Promise<void> {
  const tokenHash = formData.get('token_hash');
  const next = formData.get('next');

  if (typeof tokenHash !== 'string' || !TOKEN_HASH.test(tokenHash)) {
    return confirmError('invalid_link');
  }

  const result = await verifyEmailLink(tokenHash);
  if (!result.ok) {
    return confirmError(result.code);
  }

  // Browsers send Origin on a form POST; without it an absolute `next` falls back to /admin
  const origin = (await headers()).get('origin') ?? undefined;
  redirect(safeRedirectPath(typeof next === 'string' ? next : null, origin));
}
