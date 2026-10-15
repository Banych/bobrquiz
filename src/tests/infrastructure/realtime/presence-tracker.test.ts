import {
  type IPresenceTracker,
  type PresenceState,
  type PresenceSubscribeOptions,
  SupabasePresenceTracker,
} from '@infrastructure/realtime/presence-tracker';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mock presence tracker for testing.
 * Simulates Supabase Presence behavior without actual network calls.
 */
class MockPresenceTracker implements IPresenceTracker {
  private presenceState: Map<string, Record<string, PresenceState[]>> =
    new Map();
  private subscriptions: Map<string, PresenceSubscribeOptions> = new Map();

  subscribe(
    quizId: string,
    playerId: string,
    options: PresenceSubscribeOptions
  ): () => void {
    this.subscriptions.set(quizId, options);
    if (!this.presenceState.has(quizId)) {
      this.presenceState.set(quizId, {});
    }
    return () => {
      this.subscriptions.delete(quizId);
    };
  }

  async track(quizId: string, state: PresenceState): Promise<void> {
    const quizState = this.presenceState.get(quizId) ?? {};
    quizState[state.playerId] = [state];
    this.presenceState.set(quizId, quizState);

    // Trigger callbacks
    const options = this.subscriptions.get(quizId);
    if (options?.onJoin) {
      options.onJoin([state]);
    }
    if (options?.onSync) {
      options.onSync(quizState);
    }
  }

  async untrack(quizId: string): Promise<void> {
    // In real implementation, this would remove the current player
    // For mock, we just clear the state
  }

  getPresenceState(quizId: string): Record<string, PresenceState[]> {
    return this.presenceState.get(quizId) ?? {};
  }

  disconnect(): void {
    this.presenceState.clear();
    this.subscriptions.clear();
  }

  // Test helpers
  simulateJoin(quizId: string, state: PresenceState): void {
    const quizState = this.presenceState.get(quizId) ?? {};
    quizState[state.playerId] = [state];
    this.presenceState.set(quizId, quizState);

    const options = this.subscriptions.get(quizId);
    if (options?.onJoin) {
      options.onJoin([state]);
    }
  }

  simulateLeave(quizId: string, state: PresenceState): void {
    const quizState = this.presenceState.get(quizId) ?? {};
    delete quizState[state.playerId];
    this.presenceState.set(quizId, quizState);

    const options = this.subscriptions.get(quizId);
    if (options?.onLeave) {
      options.onLeave([state]);
    }
  }

  simulateSync(quizId: string): void {
    const options = this.subscriptions.get(quizId);
    if (options?.onSync) {
      options.onSync(this.presenceState.get(quizId) ?? {});
    }
  }
}

describe('PresenceTracker', () => {
  let tracker: MockPresenceTracker;

  beforeEach(() => {
    tracker = new MockPresenceTracker();
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const unsubscribe = tracker.subscribe('quiz-1', 'player-1', {});

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call onSync when sync event occurs', () => {
      const onSync = vi.fn();
      tracker.subscribe('quiz-1', 'player-1', { onSync });

      tracker.simulateSync('quiz-1');

      expect(onSync).toHaveBeenCalledWith({});
    });

    it('should call onJoin when player joins', () => {
      const onJoin = vi.fn();
      tracker.subscribe('quiz-1', 'player-1', { onJoin });

      const state: PresenceState = {
        playerId: 'player-2',
        playerName: 'Alice',
        joinedAt: new Date().toISOString(),
      };
      tracker.simulateJoin('quiz-1', state);

      expect(onJoin).toHaveBeenCalledWith([state]);
    });

    it('should call onLeave when player leaves', () => {
      const onLeave = vi.fn();
      tracker.subscribe('quiz-1', 'player-1', { onLeave });

      const state: PresenceState = {
        playerId: 'player-2',
        playerName: 'Alice',
        joinedAt: new Date().toISOString(),
      };
      tracker.simulateLeave('quiz-1', state);

      expect(onLeave).toHaveBeenCalledWith([state]);
    });
  });

  describe('track', () => {
    it('should add player to presence state', async () => {
      tracker.subscribe('quiz-1', 'player-1', {});

      const state: PresenceState = {
        playerId: 'player-1',
        playerName: 'Bob',
        joinedAt: new Date().toISOString(),
      };
      await tracker.track('quiz-1', state);

      const presenceState = tracker.getPresenceState('quiz-1');
      expect(presenceState['player-1']).toEqual([state]);
    });

    it('should trigger onJoin callback', async () => {
      const onJoin = vi.fn();
      tracker.subscribe('quiz-1', 'player-1', { onJoin });

      const state: PresenceState = {
        playerId: 'player-1',
        playerName: 'Bob',
        joinedAt: new Date().toISOString(),
      };
      await tracker.track('quiz-1', state);

      expect(onJoin).toHaveBeenCalledWith([state]);
    });

    it('should trigger onSync callback with updated state', async () => {
      const onSync = vi.fn();
      tracker.subscribe('quiz-1', 'player-1', { onSync });

      const state: PresenceState = {
        playerId: 'player-1',
        playerName: 'Bob',
        joinedAt: new Date().toISOString(),
      };
      await tracker.track('quiz-1', state);

      expect(onSync).toHaveBeenCalledWith({ 'player-1': [state] });
    });
  });

  describe('getPresenceState', () => {
    it('should return empty object for unknown quiz', () => {
      const state = tracker.getPresenceState('unknown-quiz');

      expect(state).toEqual({});
    });

    it('should return current presence state', async () => {
      tracker.subscribe('quiz-1', 'player-1', {});

      const state1: PresenceState = {
        playerId: 'player-1',
        playerName: 'Alice',
        joinedAt: new Date().toISOString(),
      };
      await tracker.track('quiz-1', state1);

      const state2: PresenceState = {
        playerId: 'player-2',
        playerName: 'Bob',
        joinedAt: new Date().toISOString(),
      };
      tracker.simulateJoin('quiz-1', state2);

      const presenceState = tracker.getPresenceState('quiz-1');
      expect(Object.keys(presenceState)).toHaveLength(2);
      expect(presenceState['player-1']).toEqual([state1]);
      expect(presenceState['player-2']).toEqual([state2]);
    });
  });

  describe('disconnect', () => {
    it('should clear all presence state', async () => {
      tracker.subscribe('quiz-1', 'player-1', {});
      await tracker.track('quiz-1', {
        playerId: 'player-1',
        playerName: 'Alice',
        joinedAt: new Date().toISOString(),
      });

      tracker.disconnect();

      expect(tracker.getPresenceState('quiz-1')).toEqual({});
    });
  });

  describe('multiple quizzes', () => {
    it('should track presence separately per quiz', async () => {
      tracker.subscribe('quiz-1', 'player-1', {});
      tracker.subscribe('quiz-2', 'player-2', {});

      await tracker.track('quiz-1', {
        playerId: 'player-1',
        playerName: 'Alice',
        joinedAt: new Date().toISOString(),
      });

      await tracker.track('quiz-2', {
        playerId: 'player-2',
        playerName: 'Bob',
        joinedAt: new Date().toISOString(),
      });

      const quiz1State = tracker.getPresenceState('quiz-1');
      const quiz2State = tracker.getPresenceState('quiz-2');

      expect(Object.keys(quiz1State)).toEqual(['player-1']);
      expect(Object.keys(quiz2State)).toEqual(['player-2']);
    });
  });
});

/**
 * Mock Supabase channel/client for testing SupabasePresenceTracker's real
 * channel reuse/teardown logic (not a stand-in fake -- this exercises the
 * actual class, mocking only the Supabase client boundary).
 */
type MockChannel = {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
  emit: (event: 'sync' | 'join' | 'leave', payload?: unknown) => void;
};

const createMockChannel = (): MockChannel => {
  const listeners = new Map<string, (payload: unknown) => void>();

  return {
    on: vi.fn(
      (
        _type: string,
        filter: { event: string },
        callback: (payload: unknown) => void
      ) => {
        listeners.set(filter.event, callback);
      }
    ),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
    }),
    track: vi.fn().mockResolvedValue('ok'),
    untrack: vi.fn().mockResolvedValue('ok'),
    unsubscribe: vi.fn().mockResolvedValue('ok'),
    presenceState: vi.fn().mockReturnValue({}),
    emit: (event, payload) => {
      listeners.get(event)?.(payload);
    },
  };
};

const createMockClient = () => {
  const channelsByName = new Map<string, MockChannel>();
  const channel = vi.fn((name: string) => {
    const mockChannel = createMockChannel();
    channelsByName.set(name, mockChannel);
    return mockChannel;
  });
  return {
    client: { channel } as unknown as SupabaseClient,
    channelsByName,
    channelFn: channel,
  };
};

describe('SupabasePresenceTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses the channel when subscribe is called again within the grace period', () => {
    const { client, channelsByName, channelFn } = createMockClient();
    const tracker = new SupabasePresenceTracker(client);

    const unsubscribe1 = tracker.subscribe('quiz-1', 'player-1', {});
    unsubscribe1();

    tracker.subscribe('quiz-1', 'player-1', {});

    expect(channelFn).toHaveBeenCalledTimes(1);
    const channel = channelsByName.get('presence:quiz:quiz-1')!;
    expect(channel.on).toHaveBeenCalledTimes(3);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh channel when subscribe is called after the grace period elapses', async () => {
    const { client, channelFn } = createMockClient();
    const tracker = new SupabasePresenceTracker(client);

    const unsubscribe1 = tracker.subscribe('quiz-1', 'player-1', {});
    unsubscribe1();

    await vi.advanceTimersByTimeAsync(3_000);

    tracker.subscribe('quiz-1', 'player-1', {});

    expect(channelFn).toHaveBeenCalledTimes(2);
  });

  it('routes presence events to the latest handlers after a reuse', () => {
    const { client, channelsByName } = createMockClient();
    const tracker = new SupabasePresenceTracker(client);

    const onSync1 = vi.fn();
    const unsubscribe1 = tracker.subscribe('quiz-1', 'player-1', {
      onSync: onSync1,
    });
    unsubscribe1();

    const onSync2 = vi.fn();
    tracker.subscribe('quiz-1', 'player-1', { onSync: onSync2 });

    const channel = channelsByName.get('presence:quiz:quiz-1')!;
    channel.emit('sync');

    expect(onSync1).not.toHaveBeenCalled();
    expect(onSync2).toHaveBeenCalledTimes(1);
  });

  it('tears down the channel once the grace period elapses uncancelled', async () => {
    const { client, channelsByName } = createMockClient();
    const tracker = new SupabasePresenceTracker(client);

    const unsubscribe = tracker.subscribe('quiz-1', 'player-1', {});
    unsubscribe();

    const channel = channelsByName.get('presence:quiz:quiz-1')!;
    expect(channel.untrack).not.toHaveBeenCalled();
    expect(channel.unsubscribe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(channel.untrack).toHaveBeenCalledTimes(1);
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not call channel.untrack/unsubscribe if resubscribed before the grace period elapses', async () => {
    const { client, channelsByName } = createMockClient();
    const tracker = new SupabasePresenceTracker(client);

    const unsubscribe1 = tracker.subscribe('quiz-1', 'player-1', {});
    unsubscribe1();

    tracker.subscribe('quiz-1', 'player-1', {});

    await vi.advanceTimersByTimeAsync(3_000);

    const channel = channelsByName.get('presence:quiz:quiz-1')!;
    expect(channel.untrack).not.toHaveBeenCalled();
    expect(channel.unsubscribe).not.toHaveBeenCalled();
  });
});
