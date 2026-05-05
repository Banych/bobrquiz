import {
  ConnectionStatus,
  type ConnectionStatusType,
} from '@domain/value-objects/connection-status';

export enum PlayerStatus {
  Active = 'Active',
  Disconnected = 'Disconnected',
  Finished = 'Finished',
  Removed = 'Removed',
}

export class Player {
  id: string;
  name: string;
  quizId: string;
  status: PlayerStatus;
  score: number;
  rank?: number;
  lastSeenAt: Date | null;

  constructor(id: string, name: string, quizId: string) {
    this.id = id;
    this.name = name;
    this.quizId = quizId;
    this.status = PlayerStatus.Active;
    this.score = 0;
    this.lastSeenAt = new Date();
  }

  updateStatus(newStatus: PlayerStatus): void {
    this.status = newStatus;
  }

  updateScore(newScore: number): void {
    this.score = newScore;
  }

  updateRank(newRank?: number | null): void {
    this.rank = newRank ?? undefined;
  }

  updateLastSeenAt(timestamp: Date = new Date()): void {
    this.lastSeenAt = timestamp;
  }

  /**
   * Removes the player from the game. The reason is informational for the
   * application layer (realtime events, audit); the domain entity does not
   * store it — status alone is sufficient.
   */
  removeFromGame(reason: 'kicked' | 'timeout'): void {
    if (this.status === PlayerStatus.Removed) {
      throw new Error('Player has already been removed from the game.');
    }
    void reason;
    this.status = PlayerStatus.Removed;
  }

  /**
   * Gets the connection status derived from lastSeenAt.
   * This is a computed value based on how recently the player was seen.
   */
  getConnectionStatus(now: Date = new Date()): ConnectionStatus {
    return ConnectionStatus.fromLastSeenAt(this.lastSeenAt, now);
  }

  /**
   * Returns the connection status type for DTO serialization.
   */
  getConnectionStatusType(now: Date = new Date()): ConnectionStatusType {
    return this.getConnectionStatus(now).status;
  }
}
