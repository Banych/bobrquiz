# Presence Tracker Provider Mounting Implementation Plan

**Status:** ✅ Complete — merged via [PR #59](https://github.com/Banych/bobrquiz/pull/59)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount `PresenceTrackerProvider` (built in Phase 4.1, never wired up) so the presence heartbeat actually runs in production, and harden `usePresenceTracker()` to fail loud so this exact bug class — a hook silently no-op'ing because its provider was never mounted — can't recur undetected.

**Architecture:** Two small, independent, pattern-matching changes. First, mount `PresenceTrackerProvider` in `AppProviders` (`src/app/providers.tsx`) using the existing `getPresenceTracker()` factory, exactly mirroring how `RealtimeClientProvider` is already mounted there for the sibling realtime mechanism. Second, harden `usePresenceTracker()` (`src/hooks/use-presence.tsx`) to throw when the provider is missing — matching the sibling `useRealtimeClient()`'s existing fail-loud behavior — by extracting the throw into a plain, unit-testable `assertPresenceTracker` function, then remove the two now-dead `if (!tracker) return` guards this makes unreachable.

**Tech Stack:** TypeScript, React 19 hooks/context, Vitest, no new dependencies.

## Global Constraints

- No changes to `getPresenceTracker()`'s caching, `NoopPresenceTracker` fallback, or Supabase client construction (`src/infrastructure/realtime/presence-tracker.ts`) — already correct.
- No changes to the heartbeat controller, retry/backoff/circuit-breaker logic, or cadence (`src/lib/presence-heartbeat-controller.ts`) — already fixed and verified in PR #58.
- No changes to `useReconnection`, `ConnectionStatusBanner`, or `connection-status.ts`.
- Mount the provider globally in `AppProviders`, not scoped to a route group — matches the existing `RealtimeClientProvider` pattern.
- `usePresenceTracker()`'s throw logic must be extracted into a plain function (`assertPresenceTracker`) so it's unit-testable without rendering — this repo has no jsdom/renderHook infra.

---

### Task 1: Mount `PresenceTrackerProvider` in `AppProviders`

**Files:**
- Modify: `src/app/providers.tsx`

**Interfaces:**
- Consumes: `PresenceTrackerProvider` (exported from `@hooks/use-presence`, unchanged signature: `{ tracker: IPresenceTracker; children: ReactNode }`); `getPresenceTracker` (exported from `@infrastructure/realtime/presence-tracker`, unchanged signature: `(): IPresenceTracker`).
- Produces: every component under `AppProviders` (i.e. the whole app) can now call `usePresence`/`usePresenceTracker` and receive a real (or no-op, if Supabase env vars are missing) tracker instead of `null`.

There is no unit test for this file today (it's a rendering-only wiring file with no branching logic — the same is true of the pre-existing `RealtimeClientProvider` mount it mirrors), so this task is verified via typecheck, lint, and the full test suite, not a new test.

- [x] **Step 1: Replace the file contents**

Replace `src/app/providers.tsx` entirely with:

```tsx
'use client';

import { ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { RealtimeClientProvider } from '@hooks/use-realtime-client';
import { PresenceTrackerProvider } from '@hooks/use-presence';

const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then(
      (mod) => mod.ReactQueryDevtools
    ),
  { ssr: false }
);
import { createNoopRealtimeClient } from '@infrastructure/realtime/noop-realtime-client';
import { createSupabaseRealtimeClient } from '@infrastructure/realtime/supabase-realtime-client';
import { getPresenceTracker } from '@infrastructure/realtime/presence-tracker';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 1,
      },
    },
  });

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const [presenceTracker] = useState(getPresenceTracker);
  const realtimeClient = useMemo(() => {
    return createSupabaseRealtimeClient() ?? createNoopRealtimeClient();
  }, []);

  return (
    <PresenceTrackerProvider tracker={presenceTracker}>
      <RealtimeClientProvider client={realtimeClient}>
        <QueryClientProvider client={queryClient}>
          {children}
          {process.env.NODE_ENV !== 'production' && (
            <ReactQueryDevtools buttonPosition="bottom-left" />
          )}
        </QueryClientProvider>
      </RealtimeClientProvider>
    </PresenceTrackerProvider>
  );
}
```

`useState(getPresenceTracker)` uses React's lazy-initializer form (same pattern already used one line above for `useState(createQueryClient)`), so `getPresenceTracker()` runs exactly once per `AppProviders` instance. `getPresenceTracker()` itself also caches a module-level singleton, so this is safe even if `AppProviders` were ever remounted.

- [x] **Step 2: Run the full test suite**

Run: `yarn test`
Expected: PASS — no regressions. No test currently exercises `AppProviders` directly (no jsdom/renderHook), so nothing here should change test output.

- [x] **Step 3: Run lint and build**

Run: `yarn lint`
Expected: 0 errors

Run: `yarn build`
Expected: succeeds (this also typechecks — confirms `PresenceTrackerProvider`'s `tracker` prop type matches `getPresenceTracker()`'s return type)

- [x] **Step 4: Commit**

```bash
git add src/app/providers.tsx
git commit -m "fix: mount PresenceTrackerProvider so the presence heartbeat actually runs

PresenceTrackerProvider was built in Phase 4.1 alongside the rest of
the presence-tracking foundation but was never mounted anywhere in
src/app, unlike the sibling RealtimeClientProvider. usePresenceTracker()
therefore always returned null, so usePresence's mount effect never
started the heartbeat controller (track() or persist()) for any
player, in any environment -- independent of the heartbeat resilience
fix in PR #58."
```

---

### Task 2: Harden `usePresenceTracker()` to fail loud

**Files:**
- Modify: `src/hooks/use-presence.tsx`
- Modify: `src/tests/hooks/use-presence.test.ts`

**Interfaces:**
- Produces: `assertPresenceTracker(tracker: IPresenceTracker | null): IPresenceTracker` (new export from `@hooks/use-presence`) — throws `Error('PresenceTrackerProvider is missing from the component tree.')` if `tracker` is falsy, otherwise returns it unchanged.
- Produces: `usePresenceTracker(): IPresenceTracker` — return type changes from `IPresenceTracker | null` to `IPresenceTracker` (no consumers outside this file exist today, confirmed by repo-wide search, so this is a safe signature tightening).
- Consumes: `IPresenceTracker` (unchanged, from `@infrastructure/realtime/presence-tracker`).

- [x] **Step 1: Write the failing test**

Add these imports and this new `describe` block to `src/tests/hooks/use-presence.test.ts` — full new file contents:

```typescript
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
```

- [x] **Step 2: Run tests to verify they fail**

Run: `yarn test use-presence`
Expected: FAIL — `assertPresenceTracker` is not yet exported from `@hooks/use-presence`, so the import resolves to `undefined`; calling it throws a runtime `TypeError` ("assertPresenceTracker is not a function").

- [x] **Step 3: Implement `assertPresenceTracker` and harden `usePresenceTracker`**

Replace `src/hooks/use-presence.tsx` entirely with:

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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

/**
 * Throws if the tracker is missing instead of silently returning null.
 * Extracted as a plain function so it's unit-testable without rendering
 * (this repo has no jsdom/renderHook infra).
 */
export const assertPresenceTracker = (
  tracker: IPresenceTracker | null
): IPresenceTracker => {
  if (!tracker) {
    throw new Error(
      'PresenceTrackerProvider is missing from the component tree.'
    );
  }
  return tracker;
};

export const usePresenceTracker = (): IPresenceTracker => {
  return assertPresenceTracker(useContext(PresenceTrackerContext));
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
  // the controller (and restart its timers) on every render. Synced in a
  // layout effect (not during render, since refs must not be written while
  // rendering per react-hooks/refs) so the mirroring happens synchronously
  // in the commit phase, before the controller's setTimeout-driven ticks
  // can fire against a stale ref value.
  const latestRef = useRef({
    tracker,
    quizId,
    playerId,
    playerName,
    persistToDatabase,
  });
  const onConnectionErrorRef = useRef(onConnectionError);
  const onReconnectedRef = useRef(onReconnected);

  useLayoutEffect(() => {
    latestRef.current = {
      tracker,
      quizId,
      playerId,
      playerName,
      persistToDatabase,
    };
    onConnectionErrorRef.current = onConnectionError;
    onReconnectedRef.current = onReconnected;
  });

  const track = useCallback(async () => {
    const current = latestRef.current;
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

  // Create the controller once on mount. Done in a layout effect (not
  // directly in the render body) since refs must not be written while
  // rendering; using useLayoutEffect (rather than a passive effect) ensures
  // the controller exists synchronously in the commit phase, before any
  // other timing-sensitive effects below can run. The ref-null check keeps
  // this a one-time initialization even under StrictMode's double-invoke.
  useLayoutEffect(() => {
    if (controllerRef.current === null) {
      controllerRef.current = createPresenceHeartbeatController(
        track,
        persist,
        {
          onFailureCountChange: setFailureCount,
          onSuccess: setLastSuccessfulHeartbeat,
          onConnectionError: () => onConnectionErrorRef.current?.(),
          onReconnected: () => onReconnectedRef.current?.(),
        }
      );
    }
  }, [track, persist]);

  // Subscribe to presence and start the heartbeat controller on mount.
  useEffect(() => {
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
    sendHeartbeat: () =>
      controllerRef.current?.sendImmediate() ?? Promise.resolve(),
    failureCount,
    lastSuccessfulHeartbeat,
  };
};
```

Changes from the pre-existing file:
- Added `assertPresenceTracker` (exported) and rewired `usePresenceTracker` to use it.
- `usePresenceTracker`'s return type is now `IPresenceTracker` (was `IPresenceTracker | null`).
- Removed `if (!current.tracker) return;` from `track()` — unreachable now that `tracker` can't be `null`.
- Removed `if (!tracker) return;` from the subscribe/start effect — unreachable for the same reason.

- [x] **Step 4: Run tests to verify they pass**

Run: `yarn test use-presence`
Expected: PASS (5 tests: 3 existing type-contract tests + 2 new `assertPresenceTracker` tests)

- [x] **Step 5: Run the full test suite**

Run: `yarn test`
Expected: PASS, no regressions (in particular, `presence-heartbeat-controller.test.ts` and any test importing `@hooks/use-presence` types should be unaffected — `UsePresenceOptions`/`UsePresenceReturn` are unchanged).

- [x] **Step 6: Run lint and build**

Run: `yarn lint`
Expected: 0 errors

Run: `yarn build`
Expected: succeeds

- [x] **Step 7: Commit**

```bash
git add src/hooks/use-presence.tsx src/tests/hooks/use-presence.test.ts
git commit -m "fix: harden usePresenceTracker to fail loud instead of returning null

Extracts assertPresenceTracker, a plain unit-testable function that
throws when the provider is missing, matching the sibling
useRealtimeClient()'s existing fail-loud behavior. Removes the two
if (!tracker) return guards in usePresence that this makes
unreachable. No consumers outside this file relied on the nullable
return (confirmed by repo-wide search), so this is a safe tightening."
```

---

### Task 3: Manual verification

Not a code change — confirms the heartbeat actually runs now (the core bug), then re-runs PR #58's originally-planned failure-simulation verification, which was blocked by this exact bug.

**Note:** the first attempt at this task (joining the demo quiz) immediately surfaced a second, independent bug — `SupabasePresenceTracker.subscribe()` crashing on remount, since this was the first time the heartbeat mechanism ever actually ran. That bug was fixed in a follow-up plan (`docs/progress/plans/2026-07-05-presence-channel-reuse-implementation.md`), whose own Task 2 completed all 5 steps below for real, on the fixed code. Checked off here since the verification this task specifies was genuinely performed, just as part of the follow-up plan's manual verification rather than in isolation immediately after Task 2.

- [x] **Step 1: Confirm the heartbeat now actually fires**

With the dev server running (picking up Tasks 1-2), navigate to `/join`, enter join code `TRYBOBR` (the `Bobr Quiz Demo` quiz), pick a name, join. Using the Playwright MCP's network-requests tool, confirm at least one `POST /api/quiz/[quizId]/player/[playerId]/presence` request appears within the first ~25s (the persist cadence is `20_000` ± up to `5_000` jitter). This is the concrete proof the root bug is fixed — before this plan, zero such requests were ever observed.

- [x] **Step 2: Simulate a persistence failure**

Temporarily edit `src/app/api/quiz/[quizId]/player/[playerId]/presence/route.ts` to force a failure — add as the first line inside the `POST` handler:

```typescript
return NextResponse.json({ error: 'simulated' }, { status: 500 });
```

Save and let the dev server hot-reload.

- [x] **Step 3: Confirm the player sees the reconnecting banner**

Within ~30s (5 fast retries: 1+2+4+8+8s), the `ConnectionStatusBanner` should appear on the player screen showing "Connection lost. Trying to reconnect..." — confirm via a Playwright snapshot.

- [x] **Step 4: Confirm recovery**

Revert the temporary change from Step 2, save. Within the next persist attempt (circuit-open cadence, 30s), confirm the banner clears and shows "✓ Reconnected! Your session has been restored."

- [x] **Step 5: Confirm the host's view was sensible throughout**

Check the host dashboard's Players panel during the simulated outage — the player should age through away/disconnected on the same schedule as before, then reflect the recovery once heartbeats resume.

---

## Self-Review Notes

- **Spec coverage:** All 4 in-scope items from the design spec are covered — Task 1 mounts the provider (item 1); Task 2 hardens `usePresenceTracker` and removes the dead guards (items 2-3); Task 3 runs the deferred manual verification plus the new "heartbeat actually fires" check (item 4).
- **Placeholder scan:** No TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `assertPresenceTracker(tracker: IPresenceTracker | null): IPresenceTracker` and `usePresenceTracker(): IPresenceTracker` in Task 2 match exactly what Task 1's `AppProviders` consumes (`PresenceTrackerProvider`'s existing, unchanged `{ tracker: IPresenceTracker; ... }` prop type). No other file in the repo calls `usePresenceTracker()` (confirmed via repo-wide search before writing this plan), so Task 2's signature change has no other call sites to update.
