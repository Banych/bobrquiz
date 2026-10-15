import { describe, it, expect } from 'vitest';
import type {
  UsePresenceOptions,
  UsePresenceReturn,
} from '@hooks/use-presence';
import { assertPresenceTracker } from '@hooks/use-presence';
import type { IPresenceTracker } from '@infrastructure/realtime/presence-tracker';

/**
 * Type-contract tests for usePresence's public API.
 *
 * Retry/backoff/circuit-breaker/cadence behavior is covered by
 * src/tests/lib/presence-heartbeat-controller.test.ts, since this repo has
 * no jsdom/renderHook infra to exercise the hook's timing logic directly.
 */

describe('usePresence', () => {
  describe('Type Contracts', () => {
    it('should define UsePresenceOptions with all required fields', () => {
      const mockOptions: UsePresenceOptions = {
        quizId: 'quiz-123',
        playerId: 'player-456',
        playerName: 'Test Player',
        persistToDatabase: true,
        onSync: () => {},
        onJoin: () => {},
        onLeave: () => {},
        onConnectionError: () => {},
        onReconnected: () => {},
      };

      expect(mockOptions).toHaveProperty('quizId');
      expect(mockOptions).toHaveProperty('playerId');
      expect(mockOptions).toHaveProperty('playerName');
      expect(mockOptions).toHaveProperty('persistToDatabase');
      expect(mockOptions).toHaveProperty('onSync');
      expect(mockOptions).toHaveProperty('onJoin');
      expect(mockOptions).toHaveProperty('onLeave');
      expect(mockOptions).toHaveProperty('onConnectionError');
      expect(mockOptions).toHaveProperty('onReconnected');
    });

    it('should define UsePresenceReturn with connection state', () => {
      const mockReturn: UsePresenceReturn = {
        isConnected: true,
        presenceState: {},
        sendHeartbeat: async () => {},
        failureCount: 0,
        lastSuccessfulHeartbeat: '2026-01-31T12:00:00Z',
      };

      expect(mockReturn).toHaveProperty('isConnected');
      expect(mockReturn).toHaveProperty('presenceState');
      expect(mockReturn).toHaveProperty('sendHeartbeat');
      expect(mockReturn).toHaveProperty('failureCount');
      expect(mockReturn).toHaveProperty('lastSuccessfulHeartbeat');

      expect(typeof mockReturn.isConnected).toBe('boolean');
      expect(typeof mockReturn.presenceState).toBe('object');
      expect(typeof mockReturn.sendHeartbeat).toBe('function');
      expect(typeof mockReturn.failureCount).toBe('number');
      expect(
        typeof mockReturn.lastSuccessfulHeartbeat === 'string' ||
          mockReturn.lastSuccessfulHeartbeat === null
      ).toBe(true);
    });

    it('should support optional callback props', () => {
      const minimalOptions: UsePresenceOptions = {
        quizId: 'quiz-123',
        playerId: 'player-456',
        playerName: 'Test Player',
      };

      expect(minimalOptions.persistToDatabase).toBeUndefined();
      expect(minimalOptions.onSync).toBeUndefined();
      expect(minimalOptions.onJoin).toBeUndefined();
      expect(minimalOptions.onLeave).toBeUndefined();
      expect(minimalOptions.onConnectionError).toBeUndefined();
      expect(minimalOptions.onReconnected).toBeUndefined();
    });
  });

  describe('assertPresenceTracker', () => {
    it('throws when the tracker is null', () => {
      expect(() => assertPresenceTracker(null)).toThrow(
        'PresenceTrackerProvider is missing from the component tree.'
      );
    });

    it('returns the tracker unchanged when it is not null', () => {
      const mockTracker: IPresenceTracker = {
        subscribe: () => () => {},
        track: async () => {},
        untrack: async () => {},
        getPresenceState: () => ({}),
        disconnect: () => {},
      };

      expect(assertPresenceTracker(mockTracker)).toBe(mockTracker);
    });
  });
});
