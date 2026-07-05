# Presence Channel Reuse Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `SupabasePresenceTracker.subscribe()` from crashing the player screen on remount (React Strict Mode's dev double-invoke, or any real fast remount), by keeping the channel alive for a short grace period after unsubscribe instead of racing its async teardown.

**Architecture:** Change `SupabasePresenceTracker`'s internal `Map<string, RealtimeChannel>` to `Map<string, ChannelEntry>`, where each entry pairs the channel with a mutable, in-place-mutated `handlers` object that its `.on()` callbacks read at fire-time, and a pending-teardown timer. A `subscribe()` call for a `quizId` that already has a live entry cancels any scheduled teardown and reuses the channel (merging in the new handlers) instead of calling `.on()`/`.subscribe()` again — which Supabase's realtime-js forbids on an already-subscribed channel. `unsubscribe()` schedules teardown after a grace period instead of running it immediately, so a quick remount reuses the channel before it ever gets torn down.

**Tech Stack:** TypeScript, `@supabase/supabase-js`, Vitest (`vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync()`), no new dependencies.

## Global Constraints

- No changes to `NoopPresenceTracker`, `getPresenceTracker()`'s caching, or Supabase client construction.
- No changes to `usePresence`'s public interface or its synchronous `subscribe()`-returns-a-synchronous-unsubscribe-function usage — the fix stays entirely inside `SupabasePresenceTracker`.
- The `handlers` object on a `ChannelEntry` must be mutated in place (`Object.assign(entry.handlers, options)`), never reassigned to a new object — the channel's `.on()` closures capture that exact object reference, and reassigning would silently break reuse.
- Grace period: `UNSUBSCRIBE_GRACE_PERIOD_MS = 3_000` (3 seconds).
- Add real unit tests for `SupabasePresenceTracker` itself (mocking the Supabase client boundary) — the existing test file only covers a hand-written `MockPresenceTracker` fake, never the real class.

---

### Task 1: Grace-period channel reuse in `SupabasePresenceTracker`

**Files:**
- Modify: `src/infrastructure/realtime/presence-tracker.ts`
- Modify: `src/tests/infrastructure/realtime/presence-tracker.test.ts`

**Interfaces:**
- Produces: `export class SupabasePresenceTracker implements IPresenceTracker` (currently unexported — exporting it is required so the test file can import and test it directly; its public methods — `subscribe`, `track`, `untrack`, `getPresenceState`, `disconnect` — keep their existing `IPresenceTracker` signatures unchanged).
- No other file in the repo imports `SupabasePresenceTracker` by name today (only `getPresenceTracker()`'s return type, `IPresenceTracker`, is consumed elsewhere), so exporting it has no other call sites to update.

- [ ] **Step 1: Write the failing tests**

Replace `src/tests/infrastructure/realtime/presence-tracker.test.ts` entirely with (this preserves every existing `MockPresenceTracker` test unchanged and appends a new `describe` block):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test presence-tracker`
Expected: FAIL — `SupabasePresenceTracker` is not yet exported from `@infrastructure/realtime/presence-tracker` (the class exists but has no `export` keyword yet), so the whole test file fails to load (either a "no matching export" module error, or `new SupabasePresenceTracker(...)` throwing "not a constructor" if the import resolves to `undefined`).

- [ ] **Step 3: Implement the grace-period reuse logic**

Replace `src/infrastructure/realtime/presence-tracker.ts` entirely with:

```typescript
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';

/**
 * Presence state tracked for each player.
 */
export type PresenceState = {
  playerId: string;
  playerName: string;
  joinedAt: string;
};

/**
 * Callback for presence events.
 */
export type PresenceEventHandler = (presences: PresenceState[]) => void;

/**
 * Callback for presence sync events with full state.
 */
export type PresenceSyncHandler = (
  state: Record<string, PresenceState[]>
) => void;

/**
 * Options for presence subscription.
 */
export type PresenceSubscribeOptions = {
  onSync?: PresenceSyncHandler;
  onJoin?: PresenceEventHandler;
  onLeave?: PresenceEventHandler;
};

/**
 * Interface for presence tracking operations.
 */
export interface IPresenceTracker {
  /**
   * Subscribe to presence events for a quiz.
   * Returns an unsubscribe function.
   */
  subscribe(
    quizId: string,
    playerId: string,
    options: PresenceSubscribeOptions
  ): () => void;

  /**
   * Track player presence (call after subscribe).
   */
  track(quizId: string, state: PresenceState): Promise<void>;

  /**
   * Untrack player presence (call before unsubscribe or on disconnect).
   */
  untrack(quizId: string): Promise<void>;

  /**
   * Get current presence state for a quiz.
   */
  getPresenceState(quizId: string): Record<string, PresenceState[]>;

  /**
   * Disconnect all presence channels.
   */
  disconnect(): void;
}

const PRESENCE_CHANNEL_PREFIX = 'presence:quiz:';

const getChannelName = (quizId: string): string =>
  `${PRESENCE_CHANNEL_PREFIX}${quizId}`;

/**
 * How long to keep a channel alive after its last subscriber unsubscribes,
 * before actually tearing it down. Survives quick remounts (React Strict
 * Mode's dev-only double-invoke of effects, or any real fast remount)
 * without re-calling `.on()` on an already-subscribed channel, which
 * Supabase's realtime-js throws on.
 */
const UNSUBSCRIBE_GRACE_PERIOD_MS = 3_000;

type ChannelEntry = {
  channel: RealtimeChannel;
  handlers: PresenceSubscribeOptions;
  teardownTimer: ReturnType<typeof setTimeout> | null;
};

const logPresenceIssue = (
  level: 'warn' | 'error',
  message: string,
  details: Record<string, unknown>
) => {
  if (level === 'error') {
    console.error(`[PresenceTracker] ${message}`, details);
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(`[PresenceTracker] ${message}`, details);
  }
};

/**
 * Supabase Presence Tracker implementation.
 * Uses Supabase Realtime Presence API to track player connections.
 *
 * Channels are kept alive for UNSUBSCRIBE_GRACE_PERIOD_MS after their last
 * subscriber unsubscribes, so a quick remount (React Strict Mode's
 * dev-only double-invoke, or any real fast remount) reuses the same
 * channel instead of racing its async teardown. Supabase's own realtime-js
 * client dedupes channels by topic internally and only releases a topic
 * asynchronously (via a close handshake), so recreating a channel for the
 * same topic before that completes would hand back the same,
 * already-subscribed object -- this is why reuse, not a faster teardown,
 * is the fix.
 */
export class SupabasePresenceTracker implements IPresenceTracker {
  private readonly client: SupabaseClient;
  private readonly channels: Map<string, ChannelEntry> = new Map();

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  subscribe(
    quizId: string,
    playerId: string,
    options: PresenceSubscribeOptions
  ): () => void {
    let entry = this.channels.get(quizId);

    if (entry) {
      if (entry.teardownTimer !== null) {
        clearTimeout(entry.teardownTimer);
        entry.teardownTimer = null;
      }
      Object.assign(entry.handlers, options);
    } else {
      const channelName = getChannelName(quizId);
      const channel = this.client.channel(channelName, {
        config: {
          presence: {
            key: playerId,
          },
        },
      });
      const handlers: PresenceSubscribeOptions = { ...options };

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        handlers.onSync?.(state);
      });

      channel.on(
        'presence',
        { event: 'join' },
        ({ newPresences }: { newPresences: PresenceState[] }) => {
          handlers.onJoin?.(newPresences);
        }
      );

      channel.on(
        'presence',
        { event: 'leave' },
        ({ leftPresences }: { leftPresences: PresenceState[] }) => {
          handlers.onLeave?.(leftPresences);
        }
      );

      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          logPresenceIssue('warn', 'Presence subscription status changed', {
            quizId,
            playerId,
            status,
          });
        }
      });

      entry = { channel, handlers, teardownTimer: null };
      this.channels.set(quizId, entry);
    }

    return () => {
      const current = this.channels.get(quizId);
      if (!current) return;

      current.teardownTimer = setTimeout(() => {
        this.channels.delete(quizId);
        void this.teardownChannel(quizId, current.channel);
      }, UNSUBSCRIBE_GRACE_PERIOD_MS);
    };
  }

  async track(quizId: string, state: PresenceState): Promise<void> {
    const entry = this.channels.get(quizId);
    if (!entry) {
      logPresenceIssue('warn', 'Cannot track: channel not found', { quizId });
      return;
    }

    try {
      await entry.channel.track(state);
    } catch (error) {
      logPresenceIssue('error', 'Failed to track presence', {
        quizId,
        state,
        error,
      });
    }
  }

  async untrack(quizId: string): Promise<void> {
    const entry = this.channels.get(quizId);
    if (!entry) {
      return;
    }

    try {
      await entry.channel.untrack();
    } catch (error) {
      logPresenceIssue('warn', 'Failed to untrack presence', { quizId, error });
    }
  }

  getPresenceState(quizId: string): Record<string, PresenceState[]> {
    const entry = this.channels.get(quizId);
    if (!entry) {
      return {};
    }
    return entry.channel.presenceState<PresenceState>();
  }

  private async teardownChannel(
    quizId: string,
    channel: RealtimeChannel
  ): Promise<void> {
    try {
      await channel.untrack();
      await channel.unsubscribe();
    } catch (error) {
      logPresenceIssue('warn', 'Failed to unsubscribe from presence channel', {
        quizId,
        error,
      });
    }
  }

  disconnect(): void {
    for (const [quizId, entry] of this.channels) {
      if (entry.teardownTimer !== null) {
        clearTimeout(entry.teardownTimer);
      }
      void this.teardownChannel(quizId, entry.channel);
    }
    this.channels.clear();
  }
}

/**
 * No-op presence tracker for when Supabase is not configured.
 */
class NoopPresenceTracker implements IPresenceTracker {
  subscribe(): () => void {
    return () => {};
  }

  async track(): Promise<void> {}

  async untrack(): Promise<void> {}

  getPresenceState(): Record<string, PresenceState[]> {
    return {};
  }

  disconnect(): void {}
}

const getClientEnv = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey } as const;
};

let cachedTracker: IPresenceTracker | null = null;

/**
 * Creates or returns a cached presence tracker instance.
 * Uses Supabase Presence API when credentials are available,
 * otherwise returns a no-op tracker.
 */
export const getPresenceTracker = (): IPresenceTracker => {
  if (cachedTracker) {
    return cachedTracker;
  }

  const { url, anonKey } = getClientEnv();

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[PresenceTracker] Supabase env vars missing; using no-op tracker'
      );
    }
    cachedTracker = new NoopPresenceTracker();
    return cachedTracker;
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  cachedTracker = new SupabasePresenceTracker(client);
  return cachedTracker;
};

/**
 * Resets the cached tracker (useful for testing).
 */
export const resetPresenceTracker = (): void => {
  if (cachedTracker) {
    cachedTracker.disconnect();
    cachedTracker = null;
  }
};
```

Changes from the pre-existing file:
- `SupabasePresenceTracker` is now `export`ed (was previously module-private).
- Internal storage changed from `Map<string, RealtimeChannel>` to `Map<string, ChannelEntry>`.
- `subscribe()` reuses an existing live entry (canceling any pending teardown, merging handlers in place) instead of unconditionally creating a channel and calling `.on()`/`.subscribe()`.
- All three presence events (`sync`/`join`/`leave`) are now bound unconditionally at channel-creation time (was previously gated on `options.onSync`/`onJoin`/`onLeave` being truthy on the *first* caller) — necessary since a later reuse can supply a callback the first caller didn't.
- The returned unsubscribe closure schedules a deferred `teardownTimer` instead of calling an immediate async `unsubscribe(quizId)` method.
- New private `teardownChannel(quizId, channel)` replaces the old private `unsubscribe(quizId)` — same `untrack()`/`unsubscribe()` calls, now invoked only after the grace period (or immediately from `disconnect()`).
- `disconnect()` now also clears any pending `teardownTimer`s before tearing every channel down immediately.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test presence-tracker`
Expected: PASS (17 tests: 12 existing `PresenceTracker`/`MockPresenceTracker` tests + 5 new `SupabasePresenceTracker` tests)

- [ ] **Step 5: Run the full test suite**

Run: `yarn test`
Expected: PASS, no regressions.

- [ ] **Step 6: Run lint and build**

Run: `yarn lint`
Expected: 0 errors

Run: `yarn build`
Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/realtime/presence-tracker.ts src/tests/infrastructure/realtime/presence-tracker.test.ts
git commit -m "fix: keep presence channel alive across quick remounts

SupabasePresenceTracker.subscribe() crashed on any remount fast enough
that its async unsubscribe hadn't finished yet, because it
unconditionally re-registered .on() listeners on a channel that had
already had .subscribe() called on it, which Supabase's realtime-js
forbids -- and because realtime-js itself dedupes channels by topic
name, independent of this file's own cache, a simple synchronous-map-
delete reorder wasn't sufficient on its own. Channels are now kept
alive for a 3s grace period after unsubscribe, canceling the deferred
teardown if a new subscribe for the same quiz arrives in time, with
presence event handlers routed through a mutable object so a reused
channel never needs .on() called twice."
```

---

### Task 2: Manual verification

Not a code change — confirms joining no longer crashes, then completes the `PresenceTrackerProvider` plan's originally-deferred verification (heartbeat POST requests appear, failure-simulation banner, recovery), which this bug had blocked.

- [ ] **Step 1: Confirm joining no longer crashes**

With the dev server running (picking up Task 1), navigate to `/join`, enter join code `TRYBOBR` (the `Bobr Quiz Demo` quiz), pick a name, join. Confirm via a Playwright snapshot that the actual player screen renders (not the generic "Something went wrong" error page), and confirm zero console errors.

- [ ] **Step 2: Confirm the heartbeat fires**

Using the Playwright MCP's network-requests tool, confirm at least one `POST /api/quiz/[quizId]/player/[playerId]/presence` request appears within the first ~25s.

- [ ] **Step 3: Simulate a persistence failure**

Temporarily edit `src/app/api/quiz/[quizId]/player/[playerId]/presence/route.ts` to force a failure — add as the first line inside the `POST` handler:

```typescript
return NextResponse.json({ error: 'simulated' }, { status: 500 });
```

Save and let the dev server hot-reload.

- [ ] **Step 4: Confirm the player sees the reconnecting banner**

Within ~30s (5 fast retries: 1+2+4+8+8s), the `ConnectionStatusBanner` should appear on the player screen showing "Connection lost. Trying to reconnect..." — confirm via a Playwright snapshot.

- [ ] **Step 5: Confirm recovery**

Revert the temporary change from Step 3, save. Within the next persist attempt (circuit-open cadence, 30s), confirm the banner clears and shows "✓ Reconnected! Your session has been restored."

- [ ] **Step 6: Confirm the host's view was sensible throughout**

Check the host dashboard's Players panel during the simulated outage — the player should age through away/disconnected on the same schedule as before, then reflect the recovery once heartbeats resume.

---

## Self-Review Notes

- **Spec coverage:** All 4 in-scope items from the design spec are covered — Task 1 implements the grace-period reuse (items 1-2) and adds real `SupabasePresenceTracker` unit tests (item 3); Task 2 runs the manual verification, including the originally-deferred `PresenceTrackerProvider` Task 3 (item 4).
- **Placeholder scan:** No TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `ChannelEntry`'s shape (`channel`/`handlers`/`teardownTimer`) is used identically across `subscribe()`, `track()`, `untrack()`, `getPresenceState()`, `disconnect()`, and `teardownChannel()`. The mock `MockChannel`/`createMockClient()` helpers in the test file expose exactly the methods (`on`, `subscribe`, `track`, `untrack`, `unsubscribe`, `presenceState`) that `SupabasePresenceTracker`'s implementation calls on a real `RealtimeChannel`.
