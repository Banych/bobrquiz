# Presence Heartbeat Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the presence heartbeat from silently swallowing DB-write failures (which currently lets a fully-connected player be marked away/disconnected/removed with zero feedback), and reduce the heartbeat's contribution to Supabase pool connection pressure.

**Architecture:** Extract the retry/backoff/circuit-breaker/scheduling logic that currently lives inline in `usePresence` into a standalone, framework-agnostic `createPresenceHeartbeatController` factory in `src/lib/`, matching this repo's existing `src/lib/debounce-broadcast.ts` pattern. This makes the exact timing/failure logic that caused the bug unit-testable with `vi.useFakeTimers()` — this repo has no `jsdom`/`renderHook` infra, so hook-level tests here are type-contract-only and cannot catch this class of bug. `use-presence.tsx` becomes a thin React wrapper around the controller; its public API (`UsePresenceOptions`/`UsePresenceReturn`) is unchanged, so `useReconnection` and all consumers need zero changes.

**Tech Stack:** TypeScript, React 19 hooks, Vitest (`vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync()`), no new dependencies.

## Global Constraints

- Persist cadence (base + jitter) must stay comfortably under `CONNECTED_THRESHOLD_MS` (30s, defined in `src/domain/value-objects/connection-status.ts`) — do not change that domain constant.
- No new npm dependencies (no `jsdom`, no `@testing-library/react`) — stay within this repo's existing test-without-rendering convention for hooks.
- No changes to `useReconnection`, `ConnectionStatusBanner`, `connection-status.ts`, or any host-side hook — they are already correct.
- `console.warn` on heartbeat failure must fire unconditionally (not gated to `NODE_ENV === 'development'`) so production incidents leave a log trace.
- Follow this repo's `src/lib/` convention: factory function returning a plain object (not a class), JSDoc on the exported function.

---

### Task 1: `PresenceHeartbeatController` — core scheduling/retry/circuit-breaker logic

**Files:**
- Create: `src/lib/presence-heartbeat-controller.ts`
- Test: `src/tests/lib/presence-heartbeat-controller.test.ts`

**Interfaces:**
- Produces: `createPresenceHeartbeatController(track: () => Promise<void>, persist: () => Promise<void>, callbacks: PresenceHeartbeatCallbacks, config?: PresenceHeartbeatConfig): PresenceHeartbeatController`
  - `PresenceHeartbeatCallbacks = { onFailureCountChange: (count: number) => void; onSuccess: (timestampIso: string) => void; onConnectionError: () => void; onReconnected: () => void }`
  - `PresenceHeartbeatConfig = { trackIntervalMs: number; persistIntervalMs: number; persistJitterMs: number; circuitOpenIntervalMs: number; maxRetryAttempts: number; retryDelaysMs: number[] }`
  - `DEFAULT_PRESENCE_HEARTBEAT_CONFIG: PresenceHeartbeatConfig` — the production values.
  - `PresenceHeartbeatController = { start: (options: { persistEnabled: boolean }) => void; sendImmediate: () => Promise<void>; stop: () => void; getFailureCount: () => number }`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/lib/presence-heartbeat-controller.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPresenceHeartbeatController,
  DEFAULT_PRESENCE_HEARTBEAT_CONFIG,
  type PresenceHeartbeatCallbacks,
  type PresenceHeartbeatConfig,
} from '@lib/presence-heartbeat-controller';

const FAST_CONFIG: PresenceHeartbeatConfig = {
  trackIntervalMs: 1000,
  persistIntervalMs: 2000,
  persistJitterMs: 0,
  circuitOpenIntervalMs: 5000,
  maxRetryAttempts: 3,
  retryDelaysMs: [100, 200, 400],
};

const makeCallbacks = (): PresenceHeartbeatCallbacks & {
  failureCounts: number[];
  successes: string[];
  connectionErrors: number;
  reconnects: number;
} => {
  const failureCounts: number[] = [];
  const successes: string[] = [];
  let connectionErrors = 0;
  let reconnects = 0;

  return {
    failureCounts,
    successes,
    get connectionErrors() {
      return connectionErrors;
    },
    get reconnects() {
      return reconnects;
    },
    onFailureCountChange: (count) => failureCounts.push(count),
    onSuccess: (timestamp) => successes.push(timestamp),
    onConnectionError: () => {
      connectionErrors += 1;
    },
    onReconnected: () => {
      reconnects += 1;
    },
  };
};

describe('presence-heartbeat-controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines the expected production config', () => {
    expect(DEFAULT_PRESENCE_HEARTBEAT_CONFIG).toEqual({
      trackIntervalMs: 10_000,
      persistIntervalMs: 20_000,
      persistJitterMs: 5_000,
      circuitOpenIntervalMs: 30_000,
      maxRetryAttempts: 5,
      retryDelaysMs: [1000, 2000, 4000, 8000, 8000],
    });
  });

  it('runs track and persist once immediately on start when persistEnabled', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const callbacks = makeCallbacks();
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      callbacks,
      FAST_CONFIG
    );

    controller.start({ persistEnabled: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(track).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not run persist when persistEnabled is false', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      FAST_CONFIG
    );

    controller.start({ persistEnabled: false });
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.trackIntervalMs * 3);

    expect(persist).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledTimes(4); // t=0, 1000, 2000, 3000
  });

  it('reschedules track on trackIntervalMs after a success, independent of persist', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      FAST_CONFIG
    );

    controller.start({ persistEnabled: true });
    await vi.advanceTimersByTimeAsync(0); // t=0 tick
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.trackIntervalMs); // t=1000

    expect(track).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(1); // persistIntervalMs is 2000, not due yet
  });

  it('runs persist on its own persistIntervalMs cadence, slower than track', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      FAST_CONFIG
    );

    controller.start({ persistEnabled: true });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.persistIntervalMs);

    expect(track).toHaveBeenCalledTimes(3); // t=0, 1000, 2000
    expect(persist).toHaveBeenCalledTimes(2); // t=0, 2000
  });

  it('applies jitter to the persist cadence, bounded by persistJitterMs', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const jitteredConfig: PresenceHeartbeatConfig = {
      ...FAST_CONFIG,
      persistJitterMs: 1000,
    };
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      jitteredConfig
    );

    controller.start({ persistEnabled: true });
    await vi.advanceTimersByTimeAsync(0); // t=0, first persist
    // Math.random() = 0.5 -> jitter = 500ms -> next persist due at t=2500
    await vi.advanceTimersByTimeAsync(2499);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('backs off using retryDelaysMs on consecutive track failures', async () => {
    const track = vi.fn().mockRejectedValue(new Error('track failed'));
    const persist = vi.fn().mockResolvedValue(undefined);
    const callbacks = makeCallbacks();
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      callbacks,
      FAST_CONFIG
    );

    controller.start({ persistEnabled: false });
    await vi.advanceTimersByTimeAsync(0); // attempt 1 fails
    expect(track).toHaveBeenCalledTimes(1);
    expect(callbacks.failureCounts).toEqual([1]);

    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[0]); // +100ms -> attempt 2
    expect(track).toHaveBeenCalledTimes(2);
    expect(callbacks.failureCounts).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[1]); // +200ms -> attempt 3
    expect(track).toHaveBeenCalledTimes(3);
    expect(callbacks.failureCounts).toEqual([1, 2, 3]);
    expect(callbacks.connectionErrors).toBe(1); // tripped at maxRetryAttempts (3)
  });

  it('calls onConnectionError exactly once even if failures continue', async () => {
    const track = vi.fn().mockRejectedValue(new Error('track failed'));
    const persist = vi.fn().mockResolvedValue(undefined);
    const callbacks = makeCallbacks();
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      callbacks,
      FAST_CONFIG
    );

    controller.start({ persistEnabled: false });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[0]);
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[1]);
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.circuitOpenIntervalMs);
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.circuitOpenIntervalMs);

    expect(callbacks.connectionErrors).toBe(1);
  });

  it('slows to circuitOpenIntervalMs once maxRetryAttempts is reached', async () => {
    const track = vi.fn().mockRejectedValue(new Error('track failed'));
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      FAST_CONFIG
    );

    controller.start({ persistEnabled: false });
    await vi.advanceTimersByTimeAsync(0); // attempt 1
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[0]); // attempt 2
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[1]); // attempt 3 (circuit opens)
    expect(track).toHaveBeenCalledTimes(3);

    // Circuit open: next attempt should be circuitOpenIntervalMs away, not retryDelaysMs
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.circuitOpenIntervalMs - 1);
    expect(track).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(track).toHaveBeenCalledTimes(4);
  });

  it('resets failureCount and calls onReconnected after recovery', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const track = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue(undefined);
    const callbacks = makeCallbacks();
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      callbacks,
      FAST_CONFIG
    );

    controller.start({ persistEnabled: false });
    await vi.advanceTimersByTimeAsync(0); // fails (1)
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[0]); // fails (2)
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.retryDelaysMs[1]); // succeeds

    expect(controller.getFailureCount()).toBe(0);
    expect(callbacks.reconnects).toBe(1);
    expect(callbacks.connectionErrors).toBe(0); // recovered before hitting maxRetryAttempts
  });

  it('sendImmediate runs one track+persist attempt without starting scheduled loops', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      FAST_CONFIG
    );

    await controller.sendImmediate();
    expect(track).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FAST_CONFIG.trackIntervalMs * 5);
    expect(track).toHaveBeenCalledTimes(1); // no loop was started
  });

  it('stop() clears pending timers and prevents further ticks', async () => {
    const track = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createPresenceHeartbeatController(
      track,
      persist,
      makeCallbacks(),
      FAST_CONFIG
    );

    controller.start({ persistEnabled: true });
    await vi.advanceTimersByTimeAsync(0);
    controller.stop();
    await vi.advanceTimersByTimeAsync(FAST_CONFIG.trackIntervalMs * 5);

    expect(track).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test presence-heartbeat-controller`
Expected: FAIL — `Cannot find module '@lib/presence-heartbeat-controller'`

- [ ] **Step 3: Implement `createPresenceHeartbeatController`**

Create `src/lib/presence-heartbeat-controller.ts`:

```typescript
/**
 * Presence heartbeat scheduling, retry/backoff, and circuit-breaker logic,
 * extracted from usePresence so it can be unit-tested without rendering React
 * (this repo has no jsdom/renderHook infra for hooks).
 *
 * Runs two independent loops:
 * - track: cheap, websocket-based Realtime presence signal, on a fast cadence.
 * - persist: DB-write heartbeat, on a slower, jittered cadence, since it is
 *   the one that contributes to Postgres pool pressure under load.
 *
 * A shared failure counter and circuit breaker cover both loops: either one
 * failing counts toward onConnectionError, and either one succeeding resets
 * the counter and fires onReconnected if there had been prior failures.
 */

export type PresenceHeartbeatCallbacks = {
  /** Called whenever the shared consecutive-failure count changes. */
  onFailureCountChange: (count: number) => void;
  /** Called on every successful track or persist attempt, with an ISO timestamp. */
  onSuccess: (timestampIso: string) => void;
  /** Called once, the moment failureCount first reaches maxRetryAttempts. */
  onConnectionError: () => void;
  /** Called once, the next time a heartbeat succeeds after prior failures. */
  onReconnected: () => void;
};

export type PresenceHeartbeatConfig = {
  /** Cadence for the Realtime presence track loop, in ms. */
  trackIntervalMs: number;
  /** Base cadence for the DB persist loop, in ms, before jitter. */
  persistIntervalMs: number;
  /** Max random jitter added to persistIntervalMs, in ms, fixed once per controller instance. */
  persistJitterMs: number;
  /** Flat cadence used once a stream's failure count reaches maxRetryAttempts. */
  circuitOpenIntervalMs: number;
  /** Number of consecutive failures on a stream before the circuit opens. */
  maxRetryAttempts: number;
  /** Backoff delays (ms) used for consecutive-failure attempts 1..maxRetryAttempts. */
  retryDelaysMs: number[];
};

export const DEFAULT_PRESENCE_HEARTBEAT_CONFIG: PresenceHeartbeatConfig = {
  trackIntervalMs: 10_000,
  persistIntervalMs: 20_000,
  persistJitterMs: 5_000,
  circuitOpenIntervalMs: 30_000,
  maxRetryAttempts: 5,
  retryDelaysMs: [1000, 2000, 4000, 8000, 8000],
};

export interface PresenceHeartbeatController {
  /** Start the track loop, and the persist loop if persistEnabled is true. */
  start: (options: { persistEnabled: boolean }) => void;
  /** Run one track + persist attempt immediately, outside the scheduled loops. */
  sendImmediate: () => Promise<void>;
  /** Stop all scheduled loops and clear pending timers. */
  stop: () => void;
  /** Current consecutive-failure count, shared across both loops. */
  getFailureCount: () => number;
}

/**
 * Create a presence heartbeat controller.
 *
 * @param track - Realtime presence track call (throws/rejects on failure)
 * @param persist - DB heartbeat persist call (throws/rejects on failure)
 * @param callbacks - Notified on failure-count changes, success, circuit trip, and recovery
 * @param config - Cadence/backoff configuration (defaults to production values)
 */
export function createPresenceHeartbeatController(
  track: () => Promise<void>,
  persist: () => Promise<void>,
  callbacks: PresenceHeartbeatCallbacks,
  config: PresenceHeartbeatConfig = DEFAULT_PRESENCE_HEARTBEAT_CONFIG
): PresenceHeartbeatController {
  let failureCount = 0;
  let hasCalledErrorCallback = false;
  let trackTimeout: ReturnType<typeof setTimeout> | null = null;
  let persistTimeout: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  const persistJitter = Math.random() * config.persistJitterMs;

  const nextDelayFor = (attempt: number): number =>
    attempt < config.maxRetryAttempts
      ? config.retryDelaysMs[
          Math.min(attempt - 1, config.retryDelaysMs.length - 1)
        ]
      : config.circuitOpenIntervalMs;

  const handleSuccess = (): void => {
    const hadFailures = failureCount > 0;
    failureCount = 0;
    hasCalledErrorCallback = false;
    callbacks.onFailureCountChange(0);
    callbacks.onSuccess(new Date().toISOString());
    if (hadFailures) {
      callbacks.onReconnected();
    }
  };

  const handleFailure = (error: unknown): number => {
    failureCount += 1;
    callbacks.onFailureCountChange(failureCount);

    console.warn(
      `[PresenceHeartbeatController] Heartbeat failed (attempt ${failureCount}):`,
      error
    );

    if (failureCount >= config.maxRetryAttempts && !hasCalledErrorCallback) {
      hasCalledErrorCallback = true;
      callbacks.onConnectionError();
    }

    return failureCount;
  };

  const runTrackTick = async (): Promise<void> => {
    let delay = config.trackIntervalMs;
    try {
      await track();
      handleSuccess();
    } catch (error) {
      delay = nextDelayFor(handleFailure(error));
    }
    if (stopped) return;
    trackTimeout = setTimeout(() => void runTrackTick(), delay);
  };

  const runPersistTick = async (): Promise<void> => {
    let delay = config.persistIntervalMs + persistJitter;
    try {
      await persist();
      handleSuccess();
    } catch (error) {
      delay = nextDelayFor(handleFailure(error));
    }
    if (stopped) return;
    persistTimeout = setTimeout(() => void runPersistTick(), delay);
  };

  return {
    start: ({ persistEnabled }) => {
      stopped = false;
      void runTrackTick();
      if (persistEnabled) {
        void runPersistTick();
      }
    },
    sendImmediate: async () => {
      try {
        await track();
        await persist();
        handleSuccess();
      } catch (error) {
        handleFailure(error);
      }
    },
    stop: () => {
      stopped = true;
      if (trackTimeout) clearTimeout(trackTimeout);
      if (persistTimeout) clearTimeout(persistTimeout);
      trackTimeout = null;
      persistTimeout = null;
    },
    getFailureCount: () => failureCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test presence-heartbeat-controller`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/presence-heartbeat-controller.ts src/tests/lib/presence-heartbeat-controller.test.ts
git commit -m "feat: add presence heartbeat controller with decoupled track/persist cadence"
```

---

### Task 2: Wire `usePresence` to the new controller

**Files:**
- Modify: `src/hooks/use-presence.tsx` (full rewrite of internals; public API unchanged)

**Interfaces:**
- Consumes: `createPresenceHeartbeatController` from Task 1 (`@lib/presence-heartbeat-controller`)
- Produces: unchanged `UsePresenceOptions`/`UsePresenceReturn` (consumed by `src/hooks/use-reconnection.ts`, already correct, no changes needed there)

- [ ] **Step 1: Replace the file contents**

Replace `src/hooks/use-presence.tsx` entirely with:

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  IPresenceTracker,
  PresenceState,
} from '@infrastructure/realtime/presence-tracker';
import { createPresenceHeartbeatController } from '@lib/presence-heartbeat-controller';

const PresenceTrackerContext = createContext<IPresenceTracker | null>(null);

export type PresenceTrackerProviderProps = {
  tracker: IPresenceTracker;
  children: ReactNode;
};

export const PresenceTrackerProvider = ({
  tracker,
  children,
}: PresenceTrackerProviderProps) => (
  <PresenceTrackerContext.Provider value={tracker}>
    {children}
  </PresenceTrackerContext.Provider>
);

export const usePresenceTracker = (): IPresenceTracker | null => {
  return useContext(PresenceTrackerContext);
};

export type UsePresenceOptions = {
  quizId: string;
  playerId: string;
  playerName: string;
  /** Whether to persist presence to database (calls API endpoint) */
  persistToDatabase?: boolean;
  /** Called when presence sync occurs with all connected players */
  onSync?: (presences: Record<string, PresenceState[]>) => void;
  /** Called when a player joins */
  onJoin?: (presences: PresenceState[]) => void;
  /** Called when a player leaves */
  onLeave?: (presences: PresenceState[]) => void;
  /** Called after maxRetryAttempts consecutive heartbeat failures */
  onConnectionError?: () => void;
  /** Called when a heartbeat succeeds after previous failures */
  onReconnected?: () => void;
};

export type UsePresenceReturn = {
  /** Whether the presence connection is active */
  isConnected: boolean;
  /** Current presence state for all players */
  presenceState: Record<string, PresenceState[]>;
  /** Manually send an immediate track + persist attempt */
  sendHeartbeat: () => Promise<void>;
  /** Number of consecutive heartbeat failures */
  failureCount: number;
  /** Timestamp of last successful heartbeat */
  lastSuccessfulHeartbeat: string | null;
};

/**
 * Hook for tracking player presence in a quiz.
 * Joins the presence channel on mount, runs the heartbeat controller's
 * track/persist loops, and cleans up on unmount.
 */
export const usePresence = ({
  quizId,
  playerId,
  playerName,
  persistToDatabase = false,
  onSync,
  onJoin,
  onLeave,
  onConnectionError,
  onReconnected,
}: UsePresenceOptions): UsePresenceReturn => {
  const tracker = usePresenceTracker();
  const [isConnected, setIsConnected] = useState(false);
  const [presenceState, setPresenceState] = useState<
    Record<string, PresenceState[]>
  >({});
  const [failureCount, setFailureCount] = useState(0);
  const [lastSuccessfulHeartbeat, setLastSuccessfulHeartbeat] = useState<
    string | null
  >(null);
  const joinedAtRef = useRef<string>(new Date().toISOString());

  // Latest-value refs so the controller's track/persist functions and
  // callbacks never close over stale props, without needing to recreate
  // the controller (and restart its timers) on every render.
  const latestRef = useRef({ tracker, quizId, playerId, playerName, persistToDatabase });
  latestRef.current = { tracker, quizId, playerId, playerName, persistToDatabase };
  const onConnectionErrorRef = useRef(onConnectionError);
  onConnectionErrorRef.current = onConnectionError;
  const onReconnectedRef = useRef(onReconnected);
  onReconnectedRef.current = onReconnected;

  const track = useCallback(async () => {
    const current = latestRef.current;
    if (!current.tracker) return;
    await current.tracker.track(current.quizId, {
      playerId: current.playerId,
      playerName: current.playerName,
      joinedAt: joinedAtRef.current,
    });
  }, []);

  const persist = useCallback(async () => {
    const current = latestRef.current;
    if (!current.persistToDatabase) return;

    const response = await fetch(
      `/api/quiz/${current.quizId}/player/${current.playerId}/presence`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: new Date().toISOString() }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Presence persist request failed with status ${response.status}`
      );
    }
  }, []);

  const controllerRef = useRef<ReturnType<
    typeof createPresenceHeartbeatController
  > | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createPresenceHeartbeatController(track, persist, {
      onFailureCountChange: setFailureCount,
      onSuccess: setLastSuccessfulHeartbeat,
      onConnectionError: () => onConnectionErrorRef.current?.(),
      onReconnected: () => onReconnectedRef.current?.(),
    });
  }

  // Subscribe to presence and start the heartbeat controller on mount.
  useEffect(() => {
    if (!tracker) return;

    const unsubscribe = tracker.subscribe(quizId, playerId, {
      onSync: (state) => {
        setPresenceState(state);
        setIsConnected(true);
        onSync?.(state);
      },
      onJoin: (presences) => {
        setPresenceState(tracker.getPresenceState(quizId));
        onJoin?.(presences);
      },
      onLeave: (presences) => {
        setPresenceState(tracker.getPresenceState(quizId));
        onLeave?.(presences);
      },
    });

    controllerRef.current?.start({ persistEnabled: persistToDatabase });

    return () => {
      controllerRef.current?.stop();
      void tracker.untrack(quizId);
      unsubscribe();
      setIsConnected(false);
    };
    // onSync/onJoin/onLeave intentionally included to match prior behavior;
    // track/persist/controller are stable across renders (see refs above).
  }, [tracker, quizId, playerId, persistToDatabase, onSync, onJoin, onLeave]);

  return {
    isConnected,
    presenceState,
    sendHeartbeat: () => controllerRef.current!.sendImmediate(),
    failureCount,
    lastSuccessfulHeartbeat,
  };
};
```

- [ ] **Step 2: Run the existing type-contract test to verify the public API is unchanged**

Run: `yarn test use-presence`
Expected: PASS (see Task 3 for cleanup of stale assertions in this file)

- [ ] **Step 3: Run the full test suite**

Run: `yarn test`
Expected: PASS — no regressions in `use-reconnection.test.ts` or anywhere else importing `usePresence`'s types.

- [ ] **Step 4: Run lint and typecheck**

Run: `yarn lint`
Expected: 0 errors (pre-existing warnings in unrelated files are fine, see baseline noted below)

Run: `yarn build`
Expected: succeeds (this also typechecks)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-presence.tsx
git commit -m "fix: stop swallowing presence heartbeat DB-write failures

Delegates track/persist scheduling and retry/backoff to the new
PresenceHeartbeatController. persistPresence failures (including
non-2xx responses, which previously weren't even detected) now
propagate into the existing circuit-breaker instead of being
silently caught, so useReconnection's disconnected/reconnecting
state and ConnectionStatusBanner actually activate for DB failures."
```

---

### Task 3: Clean up stale hook-level tests

**Files:**
- Modify: `src/tests/hooks/use-presence.test.ts`

The existing file has a `Retry Configuration` describe block asserting hardcoded literals disconnected from any import (one literally asserts `heartbeatInterval = 30_000` labeled "30 seconds", which never matched the real 10s constant) — this is dead weight now that Task 1's `presence-heartbeat-controller.test.ts` provides real, behavior-verified coverage of retry delays, max attempts, and failure-count transitions. Remove the now-redundant/misleading blocks and keep only genuine type-contract checks.

- [ ] **Step 1: Replace the file contents**

Replace `src/tests/hooks/use-presence.test.ts` entirely with:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  UsePresenceOptions,
  UsePresenceReturn,
} from '@hooks/use-presence';

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
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `yarn test use-presence`
Expected: PASS (3 tests)

- [ ] **Step 3: Run the full suite once more**

Run: `yarn test`
Expected: PASS, no regressions

- [ ] **Step 4: Commit**

```bash
git add src/tests/hooks/use-presence.test.ts
git commit -m "test: remove stale hardcoded retry-config assertions from use-presence.test.ts

Superseded by real behavioral coverage in
presence-heartbeat-controller.test.ts."
```

---

### Task 4: Manual verification

Not a code change — verifies the fix end-to-end the same way bug #1 was verified (Playwright MCP against the running dev server and the `Bobr Quiz Demo` quiz, join code `TRYBOBR`).

- [ ] **Step 1: Join as a player and confirm normal heartbeat still works**

Navigate to `/join`, enter join code `TRYBOBR`, pick a name, join. Confirm no errors in the browser console and the round progresses normally for ~30s (covers at least one persist-cadence tick).

- [ ] **Step 2: Simulate a persistence failure**

Temporarily edit `src/app/api/quiz/[quizId]/player/[playerId]/presence/route.ts` to force a failure (e.g., add `return NextResponse.json({ error: 'simulated' }, { status: 500 });` as the first line of the handler), save, and let the dev server hot-reload.

- [ ] **Step 3: Confirm the player sees the reconnecting banner**

Within ~30s (5 fast retries: 1+2+4+8+8s), the `ConnectionStatusBanner` should appear on the player screen showing "Connection lost. Trying to reconnect..." — confirm this via a Playwright snapshot.

- [ ] **Step 4: Confirm recovery**

Revert the temporary change from Step 2, save. Within the next persist attempt (circuit-open cadence, 30s), confirm the banner clears and shows "✓ Reconnected! Your session has been restored."

- [ ] **Step 5: Confirm the host's view was sensible throughout**

Check the host dashboard's Players panel during the simulated outage — the player should age through away/disconnected on the same schedule as before (that part is unchanged, and correct — the fix is that the *player* now knows, not that the host's view changes), then reflect the recovery once heartbeats resume.

---

## Self-Review Notes

- **Spec coverage:** All four in-scope items from the design spec are covered — Task 1+2 fix error propagation (item 1) and add production logging (item 4, unconditional `console.warn` in the controller); Task 1's `persistIntervalMs`/`persistJitterMs` decouple and desynchronize the persist cadence (item 2); Task 1's `circuitOpenIntervalMs` slows cadence once the circuit is open (item 3).
- **Placeholder scan:** No TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `PresenceHeartbeatController`'s shape (`start`/`sendImmediate`/`stop`/`getFailureCount`) is identical between Task 1's implementation and Task 2's consumption. `UsePresenceOptions`/`UsePresenceReturn` are byte-for-byte unchanged from the pre-existing public API, so `use-reconnection.ts` and `player-session-screen.tsx` need no changes (verified: neither imports anything beyond these two types).
