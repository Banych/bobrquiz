import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAdminUser } from '@/infrastructure/auth/supabase-auth-client';

/**
 * Proxy (Next 16's name for middleware) to protect admin routes with Supabase Auth.
 * Checks for valid session and verifies user is in admin allowlist.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log('[MIDDLEWARE] Processing request for:', pathname);

  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/login';
  const isAdminApi = pathname.startsWith('/api/admin');

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // IMPORTANT: Use getUser() which reads from JWT, not getSession()
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log('[MIDDLEWARE] User:', user?.email || 'none');

    if (!user) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!isAdminUser(user.email)) {
      console.log('[MIDDLEWARE] User not in admin allowlist');
      if (isAdminApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return new NextResponse('Forbidden: Admin access required', {
        status: 403,
      });
    }

    console.log('[MIDDLEWARE] User authorized');
    return supabaseResponse;
  } catch (error) {
    console.error('[MIDDLEWARE] Auth error:', error);
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all admin routes including /admin itself, and /api/admin routes
     */
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
