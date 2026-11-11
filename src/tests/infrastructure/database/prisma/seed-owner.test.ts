import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {},
}));

import { requireSeedQuizOwnerId } from '@infrastructure/database/prisma/seed-helpers';

describe('requireSeedQuizOwnerId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the uuid from SEED_QUIZ_OWNER_ID', () => {
    const id = '0b8f5e0c-7f8e-4c63-9a53-3f8d2f0f6a11';
    vi.stubEnv('SEED_QUIZ_OWNER_ID', id);

    expect(requireSeedQuizOwnerId()).toBe(id);
  });

  it('throws a clear message when unset', () => {
    vi.stubEnv('SEED_QUIZ_OWNER_ID', '');

    expect(() => requireSeedQuizOwnerId()).toThrow(/SEED_QUIZ_OWNER_ID/);
  });

  it('throws when the value is not a uuid', () => {
    vi.stubEnv('SEED_QUIZ_OWNER_ID', 'not-a-uuid');

    expect(() => requireSeedQuizOwnerId()).toThrow(/SEED_QUIZ_OWNER_ID.*uuid/i);
  });
});
