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

// Heartbeat interval for presence updates (10 seconds)
// Must be well below CONNECTED_THRESHOLD_MS (30s) to avoid race conditions
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;

// Maximum number of consecutive failures before calling onConnectionError
const MAX_RETRY_ATTEMPTS = 5;

// Exponential backoff delays: 1s, 2s, 4s, 8s, 8s (capped at 8s)
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];

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
  /** Called after 5 consecutive heartbeat failures */
  onConnectionError?: () => void;
  /** Called when heartbeat succeeds after previous failures */
  onReconnected?: () => void;
};

export type UsePresenceReturn = {
  /** Whether the presence connection is active */
  isConnected: boolean;
  /** Current presence state for all players */
  presenceState: Record<string, PresenceState[]>;
  /** Manually send a presence heartbeat */
  sendHeartbeat: () => Promise<void>;
  /** Number of consecutive heartbeat failures */
  failureCount: number;
  /** Timestamp of last successful heartbeat */
  lastSuccessfulHeartbeat: string | null;
};

/**
 * Hook for tracking player presence in a quiz.
 * Joins the presence channel on mount, sends heartbeats on interval,
 * and cleans up on unmount.
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
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const joinedAtRef = useRef<string>(new Date().toISOString());
  const hasCalledErrorCallbackRef = useRef(false);

  // Persist presence to database via API
  const persistPresence = useCallback(async () => {
    if (!persistToDatabase) return;

    try {
      await fetch(`/api/quiz/${quizId}/player/${playerId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: new Date().toISOString() }),
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[usePresence] Failed to persist presence:', error);
      }
    }
  }, [quizId, playerId, persistToDatabase]);

  // Send presence heartbeat
  const sendHeartbeat = useCallback(async () => {
    if (!tracker) return;

    const state: PresenceState = {
      playerId,
      playerName,
      joinedAt: joinedAtRef.current,
    };

    try {
      await tracker.track(quizId, state);
      await persistPresence();

      // Success: reset failure count and record timestamp
      const hadFailures = failureCount > 0;
      setFailureCount(0);
      setLastSuccessfulHeartbeat(new Date().toISOString());
      hasCalledErrorCallbackRef.current = false;

      // Call reconnected callback if we recovered from failures
      if (hadFailures && onReconnected) {
        onReconnected();
      }
    } catch (error) {
      // Failure: increment count and schedule retry
      const newFailureCount = failureCount + 1;
      setFailureCount(newFailureCount);

      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[usePresence] Heartbeat failed (attempt ${newFailureCount}/${MAX_RETRY_ATTEMPTS}):`,
          error
        );
      }

      // After max retries, call error callback once
      if (
        newFailureCount >= MAX_RETRY_ATTEMPTS &&
        onConnectionError &&
        !hasCalledErrorCallbackRef.current
      ) {
        hasCalledErrorCallbackRef.current = true;
        onConnectionError();
      }

      // Schedule retry with exponential backoff
      if (newFailureCount < MAX_RETRY_ATTEMPTS) {
        const delayIndex = Math.min(
          newFailureCount - 1,
          RETRY_DELAYS_MS.length - 1
        );
        const retryDelay = RETRY_DELAYS_MS[delayIndex];

        retryTimeoutRef.current = setTimeout(() => {
          void sendHeartbeat();
        }, retryDelay);
      }
    }
  }, [
    tracker,
    quizId,
    playerId,
    playerName,
    persistPresence,
    failureCount,
    onReconnected,
    onConnectionError,
  ]);

  // Subscribe to presence and start heartbeat on mount
  useEffect(() => {
    if (!tracker) return;

    // Subscribe to presence events
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

    // Track initial presence after subscription
    void sendHeartbeat();

    // Start heartbeat interval
    heartbeatIntervalRef.current = setInterval(() => {
      void sendHeartbeat();
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      void tracker.untrack(quizId);
      unsubscribe();
      setIsConnected(false);
    };
  }, [tracker, quizId, playerId, sendHeartbeat, onSync, onJoin, onLeave]);

  return {
    isConnected,
    presenceState,
    sendHeartbeat,
    failureCount,
    lastSuccessfulHeartbeat,
  };
};
