import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignQuizOwner,
  parseOwnerIdArg,
} from '@infrastructure/database/prisma/assign-quiz-owner-core';

const OWNER_ID = '3f2b8c1e-5d4a-4b7e-9c6d-1a2b3c4d5e6f';

const makeClient = () => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
});

describe('parseOwnerIdArg', () => {
  it('returns a valid uuid', () => {
    expect(parseOwnerIdArg(OWNER_ID)).toBe(OWNER_ID);
  });

  it.each([undefined, '', 'not-a-uuid', 'owner@example.com'])(
    'rejects %s',
    (value) => {
      expect(() => parseOwnerIdArg(value)).toThrow(/uuid/i);
    }
  );
});

describe('assignQuizOwner', () => {
  const client = makeClient();

  beforeEach(() => {
    client.$executeRaw.mockReset();
    client.$queryRaw.mockReset();
  });

  it('updates ownerless quizzes and reports changed and remaining counts', async () => {
    client.$executeRaw.mockResolvedValue(3);
    client.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    const result = await assignQuizOwner(client, OWNER_ID);

    expect(result).toEqual({ updated: 3, remaining: 0 });
    const [strings, ...values] = client.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toBe(
      'UPDATE "Quiz" SET "ownerId" = ?::uuid WHERE "ownerId" IS NULL'
    );
    expect(values).toEqual([OWNER_ID]);
  });

  it('refuses a malformed id without touching the database', async () => {
    await expect(assignQuizOwner(client, 'nope')).rejects.toThrow(/uuid/i);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});
