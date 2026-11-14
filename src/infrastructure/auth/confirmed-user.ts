import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * The part of a Supabase auth user this check reads. Supabase sets `email_confirmed_at` once the
 * user has proved they own the address (a sign-in link or code, or a confirmation email).
 */
export type EmailConfirmation = { email_confirmed_at?: string | null };

/**
 * Whether the user's email is confirmed. On its own this is not enough to host: see
 * `isHostSession`.
 *
 * This does not replace Supabase's confirm-email setting, which must stay on: with it off,
 * Supabase stamps `email_confirmed_at` at sign-up, so every new account would pass this check.
 */
export const isConfirmedUser = (
  user: EmailConfirmation | null | undefined
): boolean => Boolean(user?.email_confirmed_at);

// How a session proved its email, from the access token's `amr` claim. The emailed code and the
// link's token hash both report `otp`, also for a first-time address and after a token refresh
// (seen on dev 2026-11-14); `magiclink` is Supabase's name for its own link.
const EMAIL_PROOF_METHODS = new Set(['otp', 'magiclink']);

/**
 * The sign-in methods (`amr`) in an access token's payload. Decodes without verifying the
 * signature: pass only a token the auth server has just accepted (`getUser(token)`).
 */
export const signInMethods = (
  accessToken: string | null | undefined
): string[] => {
  const payload = accessToken?.split('.')[1];
  if (!payload) {
    return [];
  }
  try {
    const claims: unknown = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    );
    const amr = (claims as { amr?: unknown } | null)?.amr;
    if (!Array.isArray(amr)) {
      return [];
    }
    return amr.flatMap((entry: unknown) => {
      const method =
        typeof entry === 'string'
          ? entry
          : (entry as { method?: unknown } | null)?.method;
      return typeof method === 'string' ? [method] : [];
    });
  } catch {
    return [];
  }
};

/**
 * Any user with a confirmed email may host, but only in a session signed in by the emailed code
 * or link. A password session is refused: anyone can sign an address up with a password before
 * its owner does, and that password still signs in once the owner confirms the address (seen on
 * dev 2026-11-14). An unconfirmed user is treated exactly like a signed-out one.
 */
export const isHostSession = (
  user: EmailConfirmation | null | undefined,
  accessToken: string | null | undefined
): boolean =>
  isConfirmedUser(user) &&
  signInMethods(accessToken).some((method) => EMAIL_PROOF_METHODS.has(method));

/**
 * The signed-in host for a request's Supabase client, or null. Reads the session from the
 * cookies (refreshing it when expired), has the auth server verify its access token, and applies
 * `isHostSession` to that same token. Used by the proxy and `getCurrentUserId`.
 */
export const getHostUser = async (
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'getUser'>
): Promise<User | null> => {
  const {
    data: { session },
  } = await auth.getSession();
  if (!session) {
    return null;
  }
  const { data, error } = await auth.getUser(session.access_token);
  if (error || !data.user) {
    return null;
  }
  return isHostSession(data.user, session.access_token) ? data.user : null;
};
