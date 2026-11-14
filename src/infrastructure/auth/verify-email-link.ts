import { cookies } from 'next/headers';
import { createServerClient } from '@infrastructure/auth/supabase-auth-client';
import { isConfirmedUser } from '@infrastructure/auth/confirmed-user';

/** What the confirm page needs to know: signed in, or the Supabase error code to explain. */
export type EmailLinkResult = { ok: true } | { ok: false; code: string };

/**
 * Signs the current browser in with the token hash from a sign-in email's link and sets the
 * session cookie. Call it only from a POST (the confirm page's server action): a mail scanner
 * that opens the link must not use it up.
 *
 * Type `email` verifies both the "Magic Link" and the "Confirm signup" hash (a first-time
 * address gets the second); checked on dev 2026-11-14 with `generateLink`.
 */
export const verifyEmailLink = async (
  tokenHash: string
): Promise<EmailLinkResult> => {
  const supabase = await createServerClient(await cookies());
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });

  if (error) {
    return { ok: false, code: error.code ?? 'unknown' };
  }

  // Supabase confirms the address while verifying; a user left unconfirmed means the project's
  // confirm-email setting is off, and that account must not get a session here
  if (!isConfirmedUser(data.user)) {
    await supabase.auth.signOut();
    return { ok: false, code: 'email_not_confirmed' };
  }

  return { ok: true };
};
