import { describe, it, expect } from 'vitest';

import {
  DEFAULT_POOL_MAX,
  resolvePoolMax,
} from '@infrastructure/database/prisma/pool-size';

describe('resolvePoolMax', () => {
  it('defaults to 2 when unset or blank', () => {
    expect(DEFAULT_POOL_MAX).toBe(2);
    expect(resolvePoolMax(undefined)).toBe(2);
    expect(resolvePoolMax('')).toBe(2);
    expect(resolvePoolMax('  ')).toBe(2);
  });

  it('uses a positive integer', () => {
    expect(resolvePoolMax('10')).toBe(10);
    expect(resolvePoolMax(' 4 ')).toBe(4);
  });

  it.each(['0', '-1', '2.5', 'ten', '10abc'])('throws on %s', (value) => {
    expect(() => resolvePoolMax(value)).toThrow(/DATABASE_POOL_MAX/);
  });
});
