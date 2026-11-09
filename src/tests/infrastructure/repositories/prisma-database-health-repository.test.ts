import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaDatabaseHealthRepository } from '@infrastructure/repositories/prisma-database-health.repository';

const quizMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { quiz: quizMocks },
}));

const repository = new PrismaDatabaseHealthRepository();

describe('PrismaDatabaseHealthRepository', () => {
  beforeEach(() => {
    quizMocks.findFirst.mockReset();
  });

  it('reads one quiz id from the database', async () => {
    quizMocks.findFirst.mockResolvedValueOnce(null);

    await repository.ping();

    expect(quizMocks.findFirst).toHaveBeenCalledWith({
      select: { id: true },
    });
  });

  it('rejects when the database query fails', async () => {
    quizMocks.findFirst.mockRejectedValueOnce(new Error('connection refused'));

    await expect(repository.ping()).rejects.toThrow('connection refused');
  });
});
