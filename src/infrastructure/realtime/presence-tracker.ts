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
