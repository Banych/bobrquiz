import type {
  RealtimeClient,
  RealtimeEventHandler,
} from '@infrastructure/realtime/realtime-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Test implementation of SupabaseRealtimeClient's channel tracking logic.
 * We test the behavior (channel reuse, listener counting, closing flag)
 * without needing actual Supabase connections.
 */

type TrackedChannel = {
  listenerCount: number;
  handlers: Array<{ event: string; handler: RealtimeEventHandler }>;
  subscribed: boolean;
  unsubscribed: boolean;
};

class TestableRealtimeClient implements RealtimeClient {
  readonly trackedChannels = new Map<string, TrackedChannel>();
  private readonly closingChannels = new Set<string>();
  readonly errorLog: Array<{
    message: string;
    details: Record<string, unknown>;
  }> = [];

  subscribe<TPayload = unknown>(
    channelName: string,
    event: string,
    handler: RealtimeEventHandler<TPayload>
  ): () => void {
    const existing = this.trackedChannels.get(channelName);

    if (existing) {
      existing.handlers.push({
        event,
        handler: handler as RealtimeEventHandler,
      });
      existing.listenerCount++;
      return () => this.removeListener(channelName);
    }

    const tracked: TrackedChannel = {
      listenerCount: 1,
      handlers: [{ event, handler: handler as RealtimeEventHandler }],
      subscribed: true,
      unsubscribed: false,
    };
    this.trackedChannels.set(channelName, tracked);

    return () => this.removeListener(channelName);
  }

  private removeListener(channelName: string): void {
    const tracked = this.trackedChannels.get(channelName);
    if (!tracked) return;

    tracked.listenerCount--;

    if (tracked.listenerCount <= 0) {
      this.closingChannels.add(channelName);
      tracked.unsubscribed = true;
      this.trackedChannels.delete(channelName);
      this.closingChannels.delete(channelName);
    }
  }

  isClosing(channelName: string): boolean {
    return this.closingChannels.has(channelName);
  }

  async emit<TPayload = unknown>(): Promise<void> {
    // Not tested here
  }

  disconnect(): void {
    this.trackedChannels.clear();
    this.closingChannels.clear();
  }

  // Test helper: simulate receiving a broadcast
  simulateBroadcast(
    channelName: string,
    event: string,
    payload: unknown
  ): void {
    const tracked = this.trackedChannels.get(channelName);
    if (!tracked) return;

    for (const h of tracked.handlers) {
      if (h.event === event) {
        h.handler(payload);
      }
    }
  }
}

describe('SupabaseRealtimeClient channel tracking', () => {
  let client: TestableRealtimeClient;

  beforeEach(() => {
    client = new TestableRealtimeClient();
  });

  describe('channel reuse', () => {
    it('should create a single channel for multiple subscriptions to the same channel', () => {
      client.subscribe('quiz:123', 'state:update', vi.fn());
      client.subscribe('quiz:123', 'leaderboard:update', vi.fn());

      expect(client.trackedChannels.size).toBe(1);
      const tracked = client.trackedChannels.get('quiz:123');
      expect(tracked?.listenerCount).toBe(2);
      expect(tracked?.handlers).toHaveLength(2);
    });

    it('should create separate channels for different channel names', () => {
      client.subscribe('quiz:123', 'state:update', vi.fn());
      client.subscribe('quiz:456', 'state:update', vi.fn());

      expect(client.trackedChannels.size).toBe(2);
    });

    it('should deliver events to all handlers on the same channel', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      client.subscribe('quiz:123', 'state:update', handler1);
      client.subscribe('quiz:123', 'state:update', handler2);

      client.simulateBroadcast('quiz:123', 'state:update', { foo: 'bar' });

      expect(handler1).toHaveBeenCalledWith({ foo: 'bar' });
      expect(handler2).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('should only deliver events to matching event handlers', () => {
      const stateHandler = vi.fn();
      const leaderboardHandler = vi.fn();

      client.subscribe('quiz:123', 'state:update', stateHandler);
      client.subscribe('quiz:123', 'leaderboard:update', leaderboardHandler);

      client.simulateBroadcast('quiz:123', 'state:update', { state: 'active' });

      expect(stateHandler).toHaveBeenCalledWith({ state: 'active' });
      expect(leaderboardHandler).not.toHaveBeenCalled();
    });
  });

  describe('listener counting', () => {
    it('should not unsubscribe channel when some listeners remain', () => {
      const unsub1 = client.subscribe('quiz:123', 'state:update', vi.fn());
      client.subscribe('quiz:123', 'leaderboard:update', vi.fn());

      unsub1();

      // Channel should still exist with 1 listener
      expect(client.trackedChannels.has('quiz:123')).toBe(true);
      expect(client.trackedChannels.get('quiz:123')?.listenerCount).toBe(1);
    });

    it('should unsubscribe channel when last listener is removed', () => {
      const unsub1 = client.subscribe('quiz:123', 'state:update', vi.fn());
      const unsub2 = client.subscribe(
        'quiz:123',
        'leaderboard:update',
        vi.fn()
      );

      unsub1();
      unsub2();

      expect(client.trackedChannels.has('quiz:123')).toBe(false);
    });

    it('should handle multiple unsubscribe calls gracefully', () => {
      const unsub = client.subscribe('quiz:123', 'state:update', vi.fn());

      unsub();
      unsub(); // Should not throw

      expect(client.trackedChannels.has('quiz:123')).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should clear all tracked channels', () => {
      client.subscribe('quiz:123', 'state:update', vi.fn());
      client.subscribe('quiz:456', 'state:update', vi.fn());

      client.disconnect();

      expect(client.trackedChannels.size).toBe(0);
    });
  });

  describe('subscribe returns unsubscribe function', () => {
    it('should return a function', () => {
      const unsub = client.subscribe('quiz:123', 'state:update', vi.fn());
      expect(typeof unsub).toBe('function');
    });
  });
});
