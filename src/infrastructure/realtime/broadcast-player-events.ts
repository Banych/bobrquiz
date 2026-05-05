import type { PlayerSessionDTO } from '@application/dtos/player-session.dto';
import { broadcastPool } from './broadcast-channel-pool';

import { getSupabaseServerClient } from './supabase-server-client';

/**
 * Broadcasts player-specific event to a player's private channel.
 * Used for answer acknowledgments and personal scoring updates.
 */
export const broadcastPlayerEvent = async <TPayload = unknown>(
  quizId: string,
  playerId: string,
  event: string,
  payload: TPayload
): Promise<void> => {
  const client = getSupabaseServerClient();

  if (!client) {
    return;
  }

  await broadcastPool.send(
    client,
    `player:${quizId}:${playerId}`,
    event,
    payload
  );
};

/**
 * Broadcasts answer acknowledgment to a specific player.
 */
export const broadcastAnswerAck = async (
  quizId: string,
  playerId: string,
  answerId: string,
  isCorrect: boolean | null
): Promise<void> => {
  await broadcastPlayerEvent(quizId, playerId, 'answer:ack', {
    answerId,
    isCorrect,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Broadcasts updated player session data.
 */
export const broadcastPlayerUpdate = async (
  quizId: string,
  playerId: string,
  session: PlayerSessionDTO
): Promise<void> => {
  await broadcastPlayerEvent(quizId, playerId, 'player:update', session);
};

/**
 * Broadcasts a kick/removal notification to a specific player.
 */
export const broadcastPlayerKicked = async (
  quizId: string,
  playerId: string,
  reason: 'kicked' | 'timeout'
): Promise<void> => {
  await broadcastPlayerEvent(quizId, playerId, 'player:kicked', { reason });
};
