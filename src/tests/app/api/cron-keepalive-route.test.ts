import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('@application/services/factories', () => ({
  getServices: () => ({
    pingDatabaseUseCase: { execute: mocks.execute },
  }),
}));

import { GET as keepalive } from '@/app/api/cron/keepalive/route';

describe('GET /api/cron/keepalive', () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pings the database and returns ok', async () => {
    mocks.execute.mockResolvedValueOnce(undefined);

    const response = await keepalive();

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('returns 500 without the error detail when the ping fails', async () => {
    mocks.execute.mockRejectedValueOnce(
      new Error('password authentication failed for user postgres')
    );

    const response = await keepalive();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Database ping failed' });
    expect(console.error).toHaveBeenCalled();
  });
});
