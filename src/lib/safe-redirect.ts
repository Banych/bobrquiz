/** Where a host lands after signing in when no safe destination was given. */
export const DEFAULT_REDIRECT = '/admin';

// Resolving against a fixed placeholder origin lets the URL parser do the hard part: tabs,
// newlines and backslashes that a browser would turn into `//other-host` resolve to another
// origin here and are refused.
const PLACEHOLDER_ORIGIN = 'http://redirect-check.invalid';

/**
 * Returns `value` as a path on this site, or `DEFAULT_REDIRECT` when it is missing or could
 * send the browser anywhere else (an absolute or protocol-relative URL, a `javascript:` URL,
 * a backslash, whitespace or dot-segment trick). Use it for every redirect taken from a query
 * parameter.
 */
export const safeRedirectPath = (value: string | null | undefined): string => {
  if (!value?.startsWith('/')) {
    return DEFAULT_REDIRECT;
  }

  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) {
      return DEFAULT_REDIRECT;
    }
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Parsing collapses dot segments, so `/.//evil.example` keeps this origin here but comes
    // out as `//evil.example`, which a browser reads as another host
    if (path.startsWith('//') || path.startsWith('/\\')) {
      return DEFAULT_REDIRECT;
    }
    return path;
  } catch {
    return DEFAULT_REDIRECT;
  }
};
