/**
 * Supabase Auth client utilities for browser and server contexts.
 * Who may host is decided by `isConfirmedUser` in `./confirmed-user`.
 */

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for browser/client-side usage.
 * Uses browser cookies for session management.
 */
export const createBrowserClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required'
    );
  }

  return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
};

/**
 * Creates a Supabase client for server-side usage (API routes, middleware, server components).
 * Reads and writes cookies for session management.
 *
 * @param cookieStore - The Next.js cookies() store (must be passed in from server context)
 */
export const createServerClient = async (
  cookieStore: Awaited<ReturnType<typeof import('next/headers').cookies>>
) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required'
    );
  }

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
};
