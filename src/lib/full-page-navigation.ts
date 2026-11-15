/**
 * Leaves the page with a full browser load. Use it right after the session changes (signing in
 * or out) instead of `router.push`.
 *
 * In a production build, Next prefetches the links in view and keeps what came back. A visitor
 * who opened `/` while signed out has `/host` and `/admin` cached as the proxy's redirect to
 * `/login`; after the emailed code signed them in, `router.push('/host')` replayed that redirect
 * without asking the server, so the new host stayed on the sign-in page (production, 2026-11-15).
 * A full load drops the router cache and sends the new session cookie to the proxy.
 */
export const navigateWithFullLoad = (path: string): void => {
  window.location.assign(path);
};
