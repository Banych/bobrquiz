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
    sendHeartbeat: () =>
      controllerRef.current?.sendImmediate() ?? Promise.resolve(),
    failureCount,
    lastSuccessfulHeartbeat,
  };
};
