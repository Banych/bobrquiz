import { Player, PlayerStatus } from '@domain/entities/player';
import { describe, expect, it } from 'vitest';

describe('Player', () => {
  it('should initialize with the given id and name', () => {
    const player = new Player('1', 'John Doe', 'quiz-1');
    expect(player.id).toBe('1');
    expect(player.name).toBe('John Doe');
    expect(player.status).toBe(PlayerStatus.Active);
  });

  it('should initialize with lastSeenAt set to current time', () => {
    const before = new Date();
    const player = new Player('1', 'John Doe', 'quiz-1');
    const after = new Date();

    expect(player.lastSeenAt).not.toBeNull();
    expect(player.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(player.lastSeenAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should update the player status', () => {
    const player = new Player('1', 'John Doe', 'quiz-1');
    player.updateStatus(PlayerStatus.Disconnected);
    expect(player.status).toBe('Disconnected');

    player.updateStatus(PlayerStatus.Finished);
    expect(player.status).toBe(PlayerStatus.Finished);
  });

  it('should update score and rank', () => {
    const player = new Player('1', 'John Doe', 'quiz-1');
    expect(player.score).toBe(0);

    player.updateScore(25);
    player.updateRank(2);

    expect(player.score).toBe(25);
    expect(player.rank).toBe(2);

    player.updateRank(null);
    expect(player.rank).toBeUndefined();
  });

  describe('lastSeenAt', () => {
    it('should update lastSeenAt with current time when no argument provided', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');

      const before = new Date();
      player.updateLastSeenAt();
      const after = new Date();

      expect(player.lastSeenAt).not.toBeNull();
      expect(player.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(player.lastSeenAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should update lastSeenAt with specific timestamp', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      const specificTime = new Date('2024-01-15T12:00:00Z');

      player.updateLastSeenAt(specificTime);

      expect(player.lastSeenAt).toEqual(specificTime);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connected when recently seen', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      const now = new Date();

      const status = player.getConnectionStatus(now);

      expect(status.isConnected()).toBe(true);
    });

    it('should return away when lastSeenAt is between 30s and 2min ago', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      const now = new Date();
      player.lastSeenAt = new Date(now.getTime() - 60_000); // 1 minute ago

      const status = player.getConnectionStatus(now);

      expect(status.isAway()).toBe(true);
    });

    it('should return disconnected when lastSeenAt is beyond 2min ago', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      const now = new Date();
      player.lastSeenAt = new Date(now.getTime() - 180_000); // 3 minutes ago

      const status = player.getConnectionStatus(now);

      expect(status.isDisconnected()).toBe(true);
    });

    it('should return disconnected when lastSeenAt is null', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      player.lastSeenAt = null;

      const status = player.getConnectionStatus();

      expect(status.isDisconnected()).toBe(true);
    });
  });

  describe('getConnectionStatusType', () => {
    it('should return the status type string', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      const now = new Date();

      expect(player.getConnectionStatusType(now)).toBe('connected');

      player.lastSeenAt = new Date(now.getTime() - 60_000);
      expect(player.getConnectionStatusType(now)).toBe('away');

      player.lastSeenAt = new Date(now.getTime() - 180_000);
      expect(player.getConnectionStatusType(now)).toBe('disconnected');
    });
  });

  describe('removeFromGame', () => {
    it('should set status to Removed when called with kicked reason from Active', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      player.removeFromGame('kicked');
      expect(player.status).toBe(PlayerStatus.Removed);
    });

    it('should set status to Removed when called with timeout reason from Disconnected', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      player.updateStatus(PlayerStatus.Disconnected);
      player.removeFromGame('timeout');
      expect(player.status).toBe(PlayerStatus.Removed);
    });

    it('should throw when player is already Removed', () => {
      const player = new Player('1', 'John Doe', 'quiz-1');
      player.removeFromGame('kicked');
      expect(() => player.removeFromGame('kicked')).toThrow(
        'Player has already been removed from the game.'
      );
    });
  });
});
