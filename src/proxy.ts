import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isConfirmedUser } from '@/infrastructure/auth/confirmed-user';

/**
 * Proxy (Next 16's name for middleware) to protect the admin area and the host pages
 * (`/host`, `/quiz/**`) with Supabase Auth. Any signed-in user with a confirmed email may host;
 * an unconfirmed user is treated as signed out. Each route and page still checks the quiz owner.
 * The host API routes under `/api/quiz/**` check the user and the quiz owner themselves, so
 * player routes on the same paths stay anonymous.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log('[MIDDLEWARE] Processing request for:', pathname);

  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/login';
  // Same paths as the matcher's '/host' and '/quiz/:path*' (trailing slash and bare /quiz
  // included), but not /hosting or /quizzes
  const isHostPage = /^\/(host|quiz)(\/|$)/.test(pathname);
  const isAdminApi = pathname.startsWith('/api/admin');

  if (!isAdminPage && !isHostPage && !isAdminApi) {
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

    if (!user || !isConfirmedUser(user)) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
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
     * Match all admin routes including /admin itself, /api/admin routes, and the host
     * pages: the quiz picker and every /quiz/<id> page
     */
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
    '/host',
    '/quiz/:path*',
  ],
};
