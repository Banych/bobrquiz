import { cookies } from 'next/headers';
import { createServerClient } from '@infrastructure/auth/supabase-auth-client';
import { getHostUser } from '@infrastructure/auth/confirmed-user';

/**
 * Returns the id of the signed-in host for the current request, or null when nobody is signed in,
 * the user's email is not confirmed, the session was not signed in by email (a password), or the
 * auth lookup fails.
 */
export const getCurrentUserId = async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const user = await getHostUser(supabase.auth);
  return user?.id ?? null;
};
