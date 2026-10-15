# Realtime Broadcast Listener Leak Fix

**Status:** ✅ Complete

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `SupabaseRealtimeClient` from silently accumulating duplicate broadcast listeners on a channel every time a consuming hook's effect re-runs, which was found live-testing the "too many connections (~200)" production incident — a single player tab left open during a live question fired one `answer:ack` broadcast through ~180 stacked handlers after ~5 minutes, each one triggering a real `invalidateQueries()` DB round-trip. This is a more direct contributor to exhausting Supavisor's connection cap than the presence-heartbeat cadence mitigated in the July 5 fix chain (`2026-07-05-presence-heartbeat-resilience-design.md`), which never touched this code path.

**Architecture:** Change `SupabaseRealtimeClient`'s internal per-channel tracking from "one real `channel.on()` binding per `subscribe()` call, decremented by a raw refcount" to "exactly one real `channel.on()` binding per unique `(channelName, event)` pair, fanning out to a `Set<handler>` that individual `subscribe()`/`unsubscribe()` calls just add to/delete from." This sidesteps the fact that `@supabase/realtime-js`'s `RealtimeChannel` exposes no public `channel.off()` to detach a single `.on()` callback (confirmed via `node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.d.ts` — only `on`/`subscribe`/`unsubscribe`/`send` are public). As a secondary, defense-in-depth cleanup, `usePlayerSession` (the hook that actually triggered the leak, via `useCountdownTimer`'s once-a-second re-render) gets its `queryKey` memoized so its effects stop tearing down and rebuilding every second — harmless after the core fix, but wasteful and was the proximate trigger.

**Tech Stack:** TypeScript, `@supabase/supabase-js` (`RealtimeChannel`/`SupabaseClient` types only, no version change), Vitest, React `useMemo`.

## Global Constraints

- No changes to `RealtimeClient`/`RealtimeEventHandler`/`RealtimeUnsubscribe` public interface (`src/infrastructure/realtime/realtime-client.ts`) — every consumer (`use-host-quiz-state.ts`, `use-player-session.ts`, `use-round-summary-listener.ts`) keeps calling `subscribe(channel, event, handler)` and receiving a plain `() => void` unsubscribe, unchanged.
- No changes to `emit()` or `disconnect()` behavior, and no changes to `broadcast-channel-pool.ts` (the separate server-side outbound pool) or `presence-tracker.ts` — both are out of scope for this bug.
- `SupabaseRealtimeClient` must become `export`ed (it currently is not) so tests can construct it directly with a fake `SupabaseClient`, following the exact pattern already established for `SupabasePresenceTracker` in `2026-07-05-presence-channel-reuse-implementation.md` (mock only the Supabase client boundary — `channel()`, and the mock channel's `on`/`subscribe`/`unsubscribe` — never re-implement the class's own logic in the test).
- The existing `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts` file only exercises a hand-rolled `TestableRealtimeClient` copy that has the same "never actually removes a handler" bug baked in — which is exactly why this shipped untested. Keep those existing tests (they're not wrong, just insufficient) and append a new `describe` block that imports and drives the real, now-exported class.
- Per-channel `listenerCount` (whole-channel refcount, used to decide when to actually call `channel.unsubscribe()`) stays — only the per-listener dispatch mechanism changes.

---

### Task 1: Per-event dispatcher registry in `SupabaseRealtimeClient`

**Files:**
- Modify: `src/infrastructure/realtime/supabase-realtime-client.ts`
- Modify: `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts`

**Interfaces:**
- Produces: `export class SupabaseRealtimeClient implements RealtimeClient` (currently unexported). No other file imports it by name today (only `createSupabaseRealtimeClient()`'s return type, `RealtimeClient`, is consumed elsewhere), so exporting it has no other call sites to update.

- [x] **Step 1: Write the failing tests**

Append to `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts` (keep every existing `TestableRealtimeClient`-based test as-is; add this new block, plus the import, at the end of the file):

```typescript
import { SupabaseRealtimeClient } from '@infrastructure/realtime/supabase-realtime-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mock Supabase channel/client for testing SupabaseRealtimeClient's real
 * dispatcher-registry logic (not a stand-in fake -- this exercises the
 * actual class, mocking only the Supabase client boundary).
 */
type MockChannel = {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  emit: (event: string, payload: unknown) => void;
};

const createMockChannel = (): MockChannel => {
  const listeners = new Map<
    string,
    (payload: { payload: unknown }) => void
  >();

  return {
    on: vi.fn(
      (
        _type: string,
        filter: { event: string },
        callback: (payload: { payload: unknown }) => void
      ) => {
        listeners.set(filter.event, callback);
      }
    ),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
    }),
    unsubscribe: vi.fn().mockResolvedValue('ok'),
    emit: (event, payload) => {
      listeners.get(event)?.({ payload });
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

describe('SupabaseRealtimeClient (real class)', () => {
  it('binds the real channel.on listener only once per (channel, event) pair', () => {
    const { client, channelsByName } = createMockClient();
    const realtimeClient = new SupabaseRealtimeClient(client);

    realtimeClient.subscribe('quiz:123', 'answer:ack', vi.fn());
    realtimeClient.subscribe('quiz:123', 'answer:ack', vi.fn());
    realtimeClient.subscribe('quiz:123', 'answer:ack', vi.fn());

    const channel = channelsByName.get('quiz:123')!;
    expect(channel.on).toHaveBeenCalledTimes(1);
  });

  it('stops delivering to a handler after its unsubscribe is called, without affecting others', () => {
    const { client, channelsByName } = createMockClient();
    const realtimeClient = new SupabaseRealtimeClient(client);

    const handlerA = vi.fn();
    const unsubscribeA = realtimeClient.subscribe(
      'quiz:123',
      'answer:ack',
      handlerA
    );
    const handlerB = vi.fn();
    realtimeClient.subscribe('quiz:123', 'answer:ack', handlerB);

    unsubscribeA();

    const channel = channelsByName.get('quiz:123')!;
    channel.emit('answer:ack', { answerId: 'a1' });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledWith({ answerId: 'a1' });
  });

  it('regression: repeated subscribe/unsubscribe churn on the same (channel, event) -- as happens every second while a countdown timer re-renders a component -- never accumulates duplicate deliveries', () => {
    const { client, channelsByName } = createMockClient();
    const realtimeClient = new SupabaseRealtimeClient(client);

    // Simulate 5 renders' worth of effect teardown+resubscribe, each with a
    // brand-new closure (exactly what a non-memoized effect dependency causes).
    let lastHandler = vi.fn();
    let unsubscribe = realtimeClient.subscribe(
      'quiz:123',
      'answer:ack',
      lastHandler
    );
    for (let i = 0; i < 4; i++) {
      unsubscribe();
      lastHandler = vi.fn();
      unsubscribe = realtimeClient.subscribe(
        'quiz:123',
        'answer:ack',
        lastHandler
      );
    }

    const channel = channelsByName.get('quiz:123')!;
    channel.emit('answer:ack', { answerId: 'a1' });

    expect(lastHandler).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledTimes(1);
  });

  it('tears down the real channel once the last listener across all events is removed', () => {
    const { client, channelsByName } = createMockClient();
    const realtimeClient = new SupabaseRealtimeClient(client);

    const unsubscribe1 = realtimeClient.subscribe(
      'quiz:123',
      'state:update:player',
      vi.fn()
    );
    const unsubscribe2 = realtimeClient.subscribe(
      'quiz:123',
      'answer:ack',
      vi.fn()
    );

    unsubscribe1();
    const channel = channelsByName.get('quiz:123')!;
    expect(channel.unsubscribe).not.toHaveBeenCalled();

    unsubscribe2();
    expect(channel.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('supports multiple distinct events on the same channel independently', () => {
    const { client, channelsByName } = createMockClient();
    const realtimeClient = new SupabaseRealtimeClient(client);

    const stateHandler = vi.fn();
    const ackHandler = vi.fn();
    realtimeClient.subscribe('quiz:123', 'state:update:player', stateHandler);
    realtimeClient.subscribe('quiz:123', 'answer:ack', ackHandler);

    const channel = channelsByName.get('quiz:123')!;
    expect(channel.on).toHaveBeenCalledTimes(2);

    channel.emit('answer:ack', { answerId: 'a1' });
    expect(ackHandler).toHaveBeenCalledTimes(1);
    expect(stateHandler).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `yarn test supabase-realtime-client`
Expected: FAIL — `SupabaseRealtimeClient` is not yet exported (class exists but has no `export` keyword), so the new `describe` block's import resolves to `undefined` and `new SupabaseRealtimeClient(...)` throws "not a constructor."

- [x] **Step 3: Implement the dispatcher-registry fix**

Replace `src/infrastructure/realtime/supabase-realtime-client.ts`'s tracking logic. Full file:

```typescript
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type {
  RealtimeClient,
  RealtimeEventHandler,
  RealtimeUnsubscribe,
} from './realtime-client';

const DEFAULT_CHANNEL_CONFIG = {
  config: {
    broadcast: { ack: true },
  },
} as const;

const logChannelIssue = (
  level: 'warn' | 'error',
  message: string,
  details: Record<string, unknown>
) => {
  if (level === 'error') {
    console.error(message, details);
  } else if (process.env.NODE_ENV === 'development') {
    console.warn(message, details);
  }
};

type TrackedChannel = {
  channel: RealtimeChannel;
  listenerCount: number;
  eventHandlers: Map<string, Set<RealtimeEventHandler>>;
};

export class SupabaseRealtimeClient implements RealtimeClient {
  private readonly client: SupabaseClient;
  private readonly channels = new Map<string, TrackedChannel>();
  private readonly closingChannels = new Set<string>();

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  subscribe<TPayload = unknown>(
    channelName: string,
    event: string,
    handler: RealtimeEventHandler<TPayload>
  ): RealtimeUnsubscribe {
    const typedHandler = handler as RealtimeEventHandler;
    const existing = this.channels.get(channelName);

    if (existing) {
      this.bindHandler(existing, event, typedHandler);
      existing.listenerCount++;
      return () => this.removeListener(channelName, event, typedHandler);
    }

    const channel = this.client.channel(channelName, DEFAULT_CHANNEL_CONFIG);
    const tracked: TrackedChannel = {
      channel,
      listenerCount: 1,
      eventHandlers: new Map(),
    };
    this.channels.set(channelName, tracked);
    this.bindHandler(tracked, event, typedHandler);

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logChannelIssue('error', 'Supabase subscription error', {
          channelName,
          event,
          status,
        });
      } else if (
        status === 'CLOSED' &&
        !this.closingChannels.has(channelName)
      ) {
        // Only log CLOSED as error when it's unexpected (not intentional unsubscribe)
        logChannelIssue('error', 'Supabase subscription error', {
          channelName,
          event,
          status,
        });
      }
    });

    return () => this.removeListener(channelName, event, typedHandler);
  }

  /**
   * Binds exactly one real channel.on('broadcast', ...) listener per
   * (channel, event) pair, no matter how many times subscribe() is called
   * for that pair. The real listener fans out to whatever handlers are
   * currently in the Set, so adding/removing a subscriber is just a Set
   * mutation -- it never needs to touch the underlying Supabase binding
   * again. This is what prevents the leak: realtime-js exposes no public
   * channel.off() to detach a single .on() callback, so the old
   * one-listener-per-subscribe()-call design could only ever grow.
   */
  private bindHandler(
    tracked: TrackedChannel,
    event: string,
    handler: RealtimeEventHandler
  ): void {
    let handlers = tracked.eventHandlers.get(event);

    if (!handlers) {
      const newHandlers = new Set<RealtimeEventHandler>();
      handlers = newHandlers;
      tracked.eventHandlers.set(event, newHandlers);

      tracked.channel.on('broadcast', { event }, (payload) => {
        for (const boundHandler of newHandlers) {
          boundHandler(payload.payload);
        }
      });
    }

    handlers.add(handler);
  }

  private removeListener(
    channelName: string,
    event: string,
    handler: RealtimeEventHandler
  ): void {
    const tracked = this.channels.get(channelName);
    if (!tracked) return;

    tracked.eventHandlers.get(event)?.delete(handler);
    tracked.listenerCount--;

    if (tracked.listenerCount <= 0) {
      this.closingChannels.add(channelName);
      this.channels.delete(channelName);

      void tracked.channel
        .unsubscribe()
        .catch((error: unknown) => {
          logChannelIssue(
            'warn',
            'Failed to unsubscribe from Supabase channel',
            {
              channelName,
              error,
            }
          );
        })
        .finally(() => {
          this.closingChannels.delete(channelName);
        });
    }
  }

  async emit<TPayload = unknown>(
    channelName: string,
    event: string,
    payload: TPayload
  ): Promise<void> {
    const channel = this.client.channel(channelName, DEFAULT_CHANNEL_CONFIG);

    await new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.send({
              type: 'broadcast',
              event,
              payload,
            });

            resolve();
          } catch (sendError) {
            reject(sendError);
          } finally {
            try {
              await channel.unsubscribe();
            } catch (error) {
              logChannelIssue(
                'warn',
                'Failed to unsubscribe from Supabase channel',
                { channelName, event, action: 'emit', error }
              );
            }
          }
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          try {
            await channel.unsubscribe();
          } catch (error) {
            logChannelIssue(
              'warn',
              'Failed to unsubscribe from Supabase channel',
              { channelName, event, action: 'emit-error', error }
            );
          }
          reject(
            new Error(
              `Supabase channel ${channelName} failed with status ${status}`
            )
          );
        }
      });
    });
  }

  disconnect(): void {
    this.client.removeAllChannels();
    this.channels.clear();
    this.closingChannels.clear();
  }
}

const getClientEnv = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return { url, anonKey } as const;
};

export const createSupabaseRealtimeClient = (): RealtimeClient | null => {
  const { url, anonKey } = getClientEnv();

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Supabase realtime env vars missing; falling back to no-op');
    }
    return null;
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 3,
      },
    },
  });

  return new SupabaseRealtimeClient(client);
};
```

- [x] **Step 4: Run tests to verify they pass**

Run: `yarn test supabase-realtime-client`
Expected: PASS — all existing `TestableRealtimeClient` tests still pass unchanged, plus all 5 new `SupabaseRealtimeClient (real class)` tests pass.

**Checkpoint:** `yarn test src/tests/infrastructure/realtime` passes.

---

### Task 2: Memoize `usePlayerSession`'s query key (defense-in-depth cleanup)

**Files:**
- Modify: `src/hooks/use-player-session.ts`
- Create: `src/tests/hooks/use-player-session.test.ts`

**Why this is still worth doing after Task 1:** Task 1 makes repeated subscribe/unsubscribe cycles on the same `(channel, event)` correctness-neutral, so this is no longer required to fix the bug. But `usePlayerSession`'s two affected effects (`state:update:player`, `answer:ack`) still tear down and rebuild every second purely because `playerSessionQueryKey()` returns a new array literal on every call — that's needless churn (a fresh closure + Set add/delete every second for the whole lifetime of every question) that a one-line `useMemo` removes for free. Contrast with `useHostQuizState`, which never had this problem because its `channelName` is a plain string (stable by value across renders), not an array.

- [x] **Step 1: Write the test**

Create `src/tests/hooks/use-player-session.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { playerSessionQueryKey } from '@hooks/use-player-session';

describe('usePlayerSession', () => {
  describe('queryKey', () => {
    it('should generate correct query key', () => {
      const key = playerSessionQueryKey('quiz-123', 'player-456');

      expect(key).toEqual(['player-session', 'quiz-123', 'player-456']);
    });

    it('should generate different keys for different players', () => {
      const key1 = playerSessionQueryKey('quiz-123', 'player-1');
      const key2 = playerSessionQueryKey('quiz-123', 'player-2');

      expect(key1).not.toEqual(key2);
    });
  });
});
```

(This documents the array shape the memoization below wraps; the correctness-critical behavior — that resubscribe churn is harmless regardless — is already covered by Task 1's regression test.)

- [x] **Step 2: Memoize the query key**

In `src/hooks/use-player-session.ts`:

```diff
-import { useCallback, useEffect } from 'react';
+import { useCallback, useEffect, useMemo } from 'react';
```

```diff
   const realtimeClient = useRealtimeClient();
   const queryClient = useQueryClient();
   const router = useRouter();
-  const queryKey = playerSessionQueryKey(quizId, playerId);
+  const queryKey = useMemo(
+    () => playerSessionQueryKey(quizId, playerId),
+    [quizId, playerId]
+  );
   const quizChannelName = `quiz:${quizId}`;
   const playerChannelName = `player:${quizId}:${playerId}`;
```

No other lines change — `applyQuizState`'s `useCallback` and the two `useEffect`s already depend on `queryKey`/`applyQuizState`, so they become stable automatically once `queryKey`'s identity is stable across renders with the same `quizId`/`playerId`.

- [x] **Step 3: Run tests**

Run: `yarn test use-player-session`
Expected: PASS.

**Checkpoint:** `yarn test` (full suite) passes.

---

## Success Criteria

- [x] A broadcast event delivered to a channel invokes each currently-subscribed handler exactly once, regardless of how many subscribe/unsubscribe cycles happened before it on that `(channel, event)` pair.
- [x] `channel.on()` (the real Supabase binding) is called at most once per unique `(channel, event)` pair for the lifetime of that channel.
- [x] `usePlayerSession`'s two affected effects no longer tear down/rebuild every second during an active countdown.
- [x] `yarn test` passes in full.
- [x] Manually verified in the browser (Playwright, multi-tab: host + 2 players, live game with countdown running against "Bobr Quiz Demo"/TRYBOBR): each of two players submitted an answer while the countdown was actively ticking — console showed exactly one `Answer acknowledged` log per submission (11 total console messages each, vs. ~180 duplicate logs from a single event pre-fix), host tab stayed clean throughout (0 errors).

## Files Changed

- `src/infrastructure/realtime/supabase-realtime-client.ts` — dispatcher-registry rewrite, class now exported.
- `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts` — new `describe` block testing the real class against a mocked Supabase client boundary.
- `src/hooks/use-player-session.ts` — `queryKey` memoized with `useMemo`.
- `src/tests/hooks/use-player-session.test.ts` — new, queryKey shape tests.

## Decision Log

**Decision: dispatcher-registry (one real `.on()` per event) over reaching into `channel.bindings`**
Considered directly filtering `RealtimeChannel.bindings` (a public-but-undocumented Phoenix-shaped field) to remove a specific callback on unsubscribe. Rejected because it depends on `@supabase/realtime-js` internals that aren't part of its documented contract and could silently break on a dependency bump; the registry approach only uses the three documented public methods (`on`, `subscribe`, `unsubscribe`).

**Decision: rewrite the test file to drive the real class, not just extend the existing shadow-copy tests**
The existing `TestableRealtimeClient` in the test file reimplements the same buggy "push a handler, never remove it" logic as a parallel copy of the production class, which is exactly why the leak shipped without a failing test. Kept the old tests (harmless) but added real-class coverage using the same "mock only the Supabase client boundary" pattern already established for `SupabasePresenceTracker` (`2026-07-05-presence-channel-reuse-implementation.md`), so this class's actual behavior — not a hand-written analog of it — is what's under test going forward.

**Decision: memoize `usePlayerSession`'s query key even though Task 1 makes it correctness-neutral**
Alternative was leaving `use-player-session.ts` untouched once the client-level fix lands. Preferred fixing both because the per-second effect churn was the proximate trigger of the incident and is a one-line change; leaving it in place would mean every future hook that reuses this exact pattern (array literal computed inline and used as an effect dependency) keeps silently paying an avoidable render-churn cost even though it's no longer unsafe.
