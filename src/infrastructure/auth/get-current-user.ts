import { cookies } from 'next/headers';
import { createServerClient } from '@infrastructure/auth/supabase-auth-client';

/**
 * Returns the id of the signed-in Supabase user for the current request,
 * or null when nobody is signed in or the auth lookup fails.
 */
export const getCurrentUserId = async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const supabase = await createServerClient(cookieStore);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
};
