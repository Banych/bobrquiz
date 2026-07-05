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
