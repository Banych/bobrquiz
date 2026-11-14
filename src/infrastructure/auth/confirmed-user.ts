/**
 * The part of a Supabase auth user this check reads. Supabase sets `email_confirmed_at` once the
 * user has proved they own the address (a sign-in link or code, or a confirmation email).
 */
export type EmailConfirmation = { email_confirmed_at?: string | null };

/**
 * Any signed-in user with a confirmed email may host. An unconfirmed user is treated exactly like
 * a signed-out one, in the proxy and in every route that reads the current user.
 *
 * This does not replace Supabase's confirm-email setting, which must stay on: with it off,
 * Supabase stamps `email_confirmed_at` at sign-up, so every new account would pass this check.
 */
export const isConfirmedUser = (
  user: EmailConfirmation | null | undefined
): boolean => Boolean(user?.email_confirmed_at);
