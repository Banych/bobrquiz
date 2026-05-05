'use client';

import { useHostQuizPlayers } from '@/hooks/use-host-quiz-players';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PlayerListWithStatusProps {
  quizId: string;
  /**
   * Polling interval in milliseconds. Defaults to 5000ms (5s).
   */
  pollInterval?: number;
}

export function PlayerListWithStatus({
  quizId,
  pollInterval = 5000,
}: PlayerListWithStatusProps) {
  const {
    data: players = [],
    isLoading,
    error,
    kickPlayer,
    isKicking,
  } = useHostQuizPlayers(quizId, {
    refetchInterval: pollInterval,
  });

  // Calculate summary counts
  const summary = players.reduce(
    (acc, player) => {
      acc[player.connectionStatus]++;
      return acc;
    },
    { connected: 0, away: 0, disconnected: 0 }
  );

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load player connection status
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Players</h2>
        <div className="flex gap-2 text-sm text-muted-foreground">
          {summary.connected > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {summary.connected} connected
            </span>
          )}
          {summary.away > 0 && (
            <span className="text-yellow-600 dark:text-yellow-400">
              {summary.away} away
            </span>
          )}
          {summary.disconnected > 0 && (
            <span className="text-red-600 dark:text-red-400">
              {summary.disconnected} disconnected
            </span>
          )}
        </div>
      </header>

      {isLoading && players.length === 0 ? (
        <div className="text-sm text-muted-foreground">Loading players...</div>
      ) : players.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No players have joined yet
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {players.map((player) => (
            <div
              key={player.playerId}
              className="rounded-lg border border-border/80 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{player.name}</p>
                <div className="flex items-center gap-2">
                  <ConnectionStatusBadge status={player.connectionStatus} />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isKicking}
                    onClick={() => kickPlayer(player.playerId)}
                    className="h-6 px-2 text-xs"
                  >
                    Kick
                  </Button>
                </div>
              </div>
              {player.lastSeenAt && (
                <p className="text-xs text-muted-foreground">
                  Last seen: {formatLastSeen(player.lastSeenAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface ConnectionStatusBadgeProps {
  status: 'connected' | 'away' | 'disconnected';
}

function ConnectionStatusBadge({ status }: ConnectionStatusBadgeProps) {
  const variants: Record<
    'connected' | 'away' | 'disconnected',
    {
      className: string;
      label: string;
    }
  > = {
    connected: {
      className:
        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      label: 'Connected',
    },
    away: {
      className:
        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      label: 'Away',
    },
    disconnected: {
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      label: 'Disconnected',
    },
  };

  const variant = variants[status];

  return (
    <Badge
      className={cn('text-xs uppercase', variant.className)}
      variant="secondary"
    >
      {variant.label}
    </Badge>
  );
}

/**
 * Format ISO timestamp to relative time string
 */
function formatLastSeen(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 10) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
