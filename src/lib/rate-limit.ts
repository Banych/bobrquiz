/**
 * In-memory fixed-window rate limiter for public, unauthenticated endpoints
 * (join, add player, submit answer). Per-instance only — under a
 * multi-instance serverless deployment each instance tracks its own counts.
 * Acceptable while there's no production deployment yet; revisit with a
 * shared store (e.g. Upstash Redis) if that changes and abuse is observed.
 */

type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

type WindowState = {
  count: number;
  windowStart: number;
};

const store = new Map<string, WindowState>();

// Sweep expired entries occasionally so keys that stop being used don't
// accumulate forever, without needing a background timer.
const SWEEP_PROBABILITY = 0.01;

const sweepExpired = (now: number, maxWindowMs: number): void => {
  for (const [key, state] of store.entries()) {
    if (now - state.windowStart >= maxWindowMs) {
      store.delete(key);
    }
  }
};

export const checkRateLimit = (
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult => {
  const now = Date.now();

  if (Math.random() < SWEEP_PROBABILITY) {
    sweepExpired(now, windowMs);
  }

  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count < limit) {
    existing.count += 1;
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterMs: existing.windowStart + windowMs - now,
  };
};

export const getClientIp = (request: Request): string => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
};

export const enforceRateLimit = (
  request: Request,
  routeName: string,
  options: RateLimitOptions
): RateLimitResult => {
  const ip = getClientIp(request);
  return checkRateLimit(`${routeName}:${ip}`, options);
};

/** Test-only: clears all tracked rate limit state. */
export const resetRateLimitStore = (): void => {
  store.clear();
};
