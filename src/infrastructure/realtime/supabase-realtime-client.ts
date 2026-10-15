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
