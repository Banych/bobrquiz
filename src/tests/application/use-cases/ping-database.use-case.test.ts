import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDatabaseHealthRepository } from '@domain/repositories/database-health-repository';
import { PingDatabaseUseCase } from '@application/use-cases/ping-database.use-case';

describe('PingDatabaseUseCase', () => {
  const databaseHealth = {
    ping: vi.fn(),
  } satisfies IDatabaseHealthRepository;

  const useCase = new PingDatabaseUseCase(databaseHealth);

  beforeEach(() => {
    databaseHealth.ping.mockReset();
  });

  it('pings the database', async () => {
    databaseHealth.ping.mockResolvedValueOnce(undefined);

    await useCase.execute();

    expect(databaseHealth.ping).toHaveBeenCalledTimes(1);
  });

  it('rejects when the ping fails', async () => {
    databaseHealth.ping.mockRejectedValueOnce(new Error('connection refused'));

    await expect(useCase.execute()).rejects.toThrow('connection refused');
  });
});
