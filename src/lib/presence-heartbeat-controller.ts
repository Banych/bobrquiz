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
