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
 * Each loop maintains its own failure streak, since they can diverge (e.g. a
 * DB outage fails persist while the separate Realtime websocket keeps
 * succeeding) — a shared counter would let one loop's success mask the
 * other's ongoing failures. The circuit trips (onConnectionError, once) the
 * moment either stream's streak first reaches maxRetryAttempts, and clears
 * (onReconnected) once both streams are healthy again.
 */

export type PresenceHeartbeatCallbacks = {
  /** Called whenever the higher of the two loops' consecutive-failure counts changes. */
  onFailureCountChange: (count: number) => void;
  /** Called on every successful track or persist attempt, with an ISO timestamp. */
  onSuccess: (timestampIso: string) => void;
  /** Called once, the moment either stream's failure count first reaches maxRetryAttempts. */
  onConnectionError: () => void;
  /** Called once, when both streams have recovered after prior failures. */
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
  /** Higher of the two streams' current consecutive-failure counts. */
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
  let trackFailureCount = 0;
  let persistFailureCount = 0;
  let lastReportedFailureCount = 0;
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

  const isAnyStreamFailing = (): boolean =>
    trackFailureCount > 0 || persistFailureCount > 0;

  const isCircuitTripped = (): boolean =>
    trackFailureCount >= config.maxRetryAttempts ||
    persistFailureCount >= config.maxRetryAttempts;

  const reportFailureCount = (): void => {
    const nextCount = Math.max(trackFailureCount, persistFailureCount);
    if (nextCount === lastReportedFailureCount) return;
    lastReportedFailureCount = nextCount;
    callbacks.onFailureCountChange(nextCount);
  };

  const handleTrackSuccess = (): void => {
    const hadFailures = trackFailureCount > 0;
    trackFailureCount = 0;
    reportFailureCount();
    callbacks.onSuccess(new Date().toISOString());
    if (hadFailures && !isAnyStreamFailing()) {
      hasCalledErrorCallback = false;
      callbacks.onReconnected();
    }
  };

  const handlePersistSuccess = (): void => {
    const hadFailures = persistFailureCount > 0;
    persistFailureCount = 0;
    reportFailureCount();
    callbacks.onSuccess(new Date().toISOString());
    if (hadFailures && !isAnyStreamFailing()) {
      hasCalledErrorCallback = false;
      callbacks.onReconnected();
    }
  };

  const handleTrackFailure = (error: unknown): number => {
    trackFailureCount += 1;
    reportFailureCount();

    console.warn(
      `[PresenceHeartbeatController] Track heartbeat failed (attempt ${trackFailureCount}):`,
      error
    );

    if (isCircuitTripped() && !hasCalledErrorCallback) {
      hasCalledErrorCallback = true;
      callbacks.onConnectionError();
    }

    return trackFailureCount;
  };

  const handlePersistFailure = (error: unknown): number => {
    persistFailureCount += 1;
    reportFailureCount();

    console.warn(
      `[PresenceHeartbeatController] Persist heartbeat failed (attempt ${persistFailureCount}):`,
      error
    );

    if (isCircuitTripped() && !hasCalledErrorCallback) {
      hasCalledErrorCallback = true;
      callbacks.onConnectionError();
    }

    return persistFailureCount;
  };

  const runTrackTick = async (): Promise<void> => {
    let delay = config.trackIntervalMs;
    try {
      await track();
      handleTrackSuccess();
    } catch (error) {
      delay = nextDelayFor(handleTrackFailure(error));
    }
    if (stopped) return;
    trackTimeout = setTimeout(() => void runTrackTick(), delay);
  };

  const runPersistTick = async (): Promise<void> => {
    let delay = config.persistIntervalMs + persistJitter;
    try {
      await persist();
      handlePersistSuccess();
    } catch (error) {
      delay = nextDelayFor(handlePersistFailure(error));
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
        handleTrackSuccess();
      } catch (error) {
        handleTrackFailure(error);
      }
      try {
        await persist();
        handlePersistSuccess();
      } catch (error) {
        handlePersistFailure(error);
      }
    },
    stop: () => {
      stopped = true;
      if (trackTimeout) clearTimeout(trackTimeout);
      if (persistTimeout) clearTimeout(persistTimeout);
      trackTimeout = null;
      persistTimeout = null;
    },
    getFailureCount: () => Math.max(trackFailureCount, persistFailureCount),
  };
}
