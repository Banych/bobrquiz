import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  checkRateLimit,
  getClientIp,
  resetRateLimitStore,
} from '@lib/rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-03T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('allows requests under the limit', () => {
      const result = checkRateLimit('ip:1.2.3.4:join', {
        limit: 3,
        windowMs: 60_000,
      });

      expect(result.allowed).toBe(true);
    });

    it('blocks requests once the limit is exceeded within the window', () => {
      const options = { limit: 3, windowMs: 60_000 };
      checkRateLimit('ip:1.2.3.4:join', options);
      checkRateLimit('ip:1.2.3.4:join', options);
      checkRateLimit('ip:1.2.3.4:join', options);

      const result = checkRateLimit('ip:1.2.3.4:join', options);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('tracks different keys independently', () => {
      const options = { limit: 1, windowMs: 60_000 };
      checkRateLimit('ip:1.1.1.1:join', options);

      const result = checkRateLimit('ip:2.2.2.2:join', options);

      expect(result.allowed).toBe(true);
    });

    it('resets the count after the window elapses', () => {
      const options = { limit: 1, windowMs: 60_000 };
      checkRateLimit('ip:1.2.3.4:join', options);
      expect(checkRateLimit('ip:1.2.3.4:join', options).allowed).toBe(false);

      vi.setSystemTime(new Date('2026-07-03T10:01:01.000Z'));

      expect(checkRateLimit('ip:1.2.3.4:join', options).allowed).toBe(true);
    });
  });

  describe('getClientIp', () => {
    it('reads the first entry from x-forwarded-for', () => {
      const request = new Request('http://localhost/api/session/join', {
        headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.18' },
      });

      expect(getClientIp(request)).toBe('203.0.113.5');
    });

    it('falls back to x-real-ip when x-forwarded-for is absent', () => {
      const request = new Request('http://localhost/api/session/join', {
        headers: { 'x-real-ip': '203.0.113.9' },
      });

      expect(getClientIp(request)).toBe('203.0.113.9');
    });

    it('falls back to "unknown" when no IP headers are present', () => {
      const request = new Request('http://localhost/api/session/join');

      expect(getClientIp(request)).toBe('unknown');
    });
  });
});
