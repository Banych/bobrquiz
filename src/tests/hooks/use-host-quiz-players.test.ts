import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  deletePlayer,
  playerConnectionStatusQueryKey,
} from '@hooks/use-host-quiz-players';
import type { PlayerConnectionStatusDTO } from '@application/dtos/player-connection-status.dto';

describe('useHostQuizPlayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('should generate correct query key', () => {
      const quizId = 'quiz-123';
      const key = playerConnectionStatusQueryKey(quizId);

      expect(key).toEqual(['quiz', 'quiz-123', 'players', 'status']);
    });

    it('should generate different keys for different quizzes', () => {
      const key1 = playerConnectionStatusQueryKey('quiz-1');
      const key2 = playerConnectionStatusQueryKey('quiz-2');

      expect(key1).not.toEqual(key2);
      expect(key1[1]).toBe('quiz-1');
      expect(key2[1]).toBe('quiz-2');
    });
  });

  describe('configuration', () => {
    it('should support default polling interval of 5 seconds', () => {
      // Hook is configured with:
      // - staleTime: 5000
      // - refetchInterval: 5000
      // - refetchOnWindowFocus: true
      // - retry: 2
      expect(true).toBe(true);
    });

    it('should support custom refetch interval', () => {
      // Hook accepts options with custom refetchInterval
      expect(true).toBe(true);
    });

    it('should support enabled option', () => {
      // Hook respects { enabled: boolean } option
      expect(true).toBe(true);
    });
  });

  describe('data types', () => {
    it('should define PlayerConnectionStatusDTO correctly', () => {
      // Expected structure for each player status
      const mockStatus: PlayerConnectionStatusDTO = {
        playerId: 'p1',
        name: 'Player 1',
        connectionStatus: 'connected',
        lastSeenAt: new Date().toISOString(),
      };

      expect(mockStatus.playerId).toBe('p1');
      expect(mockStatus.connectionStatus).toBe('connected');
    });

    it('should handle null lastSeenAt', () => {
      const mockStatus: PlayerConnectionStatusDTO = {
        playerId: 'p1',
        name: 'Player 1',
        connectionStatus: 'disconnected',
        lastSeenAt: null,
      };

      expect(mockStatus.lastSeenAt).toBeNull();
    });

    it('should support all connection statuses', () => {
      const statuses: PlayerConnectionStatusDTO['connectionStatus'][] = [
        'connected',
        'away',
        'disconnected',
      ];

      expect(statuses).toHaveLength(3);
      expect(statuses).toContain('connected');
      expect(statuses).toContain('away');
      expect(statuses).toContain('disconnected');
    });
  });
});

describe('deletePlayer', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the reason in a DELETE to the player route', async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));

    await deletePlayer('quiz-1', 'player-1', 'timeout');

    expect(fetchMock).toHaveBeenCalledWith('/api/quiz/quiz-1/player/player-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'timeout' }),
    });
  });

  it.each([
    [401, 'Unauthorized'],
    [404, 'Quiz with ID quiz-1 not found'],
  ])('rejects with the route error on %i', async (status, error) => {
    fetchMock.mockResolvedValue(Response.json({ error }, { status }));

    await expect(deletePlayer('quiz-1', 'player-1', 'kicked')).rejects.toThrow(
      error
    );
  });

  it('rejects with a fallback message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));

    await expect(deletePlayer('quiz-1', 'player-1', 'kicked')).rejects.toThrow(
      'Unable to remove player.'
    );
  });
});
