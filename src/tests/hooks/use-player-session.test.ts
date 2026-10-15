import { describe, expect, it } from 'vitest';
import { playerSessionQueryKey } from '@hooks/use-player-session';

describe('usePlayerSession', () => {
  describe('queryKey', () => {
    it('should generate correct query key', () => {
      const key = playerSessionQueryKey('quiz-123', 'player-456');

      expect(key).toEqual(['player-session', 'quiz-123', 'player-456']);
    });

    it('should generate different keys for different players', () => {
      const key1 = playerSessionQueryKey('quiz-123', 'player-1');
      const key2 = playerSessionQueryKey('quiz-123', 'player-2');

      expect(key1).not.toEqual(key2);
    });
  });
});
