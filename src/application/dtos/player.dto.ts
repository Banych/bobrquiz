import { z } from 'zod';
import {
  PLAYER_ANSWER_MAX_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
} from './player-input-limits';

/** A player name from a join request: trimmed, not blank, capped. */
export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PLAYER_NAME_MAX_LENGTH);

/**
 * A submitted answer: trimmed (scoring compares trimmed answers), not blank,
 * capped.
 */
export const PlayerAnswerSchema = z
  .string()
  .trim()
  .min(1)
  .max(PLAYER_ANSWER_MAX_LENGTH);

export const PlayerStatusDTO = z.enum([
  'Active',
  'Disconnected',
  'Finished',
  'Removed',
]);

export const ConnectionStatusDTO = z.enum([
  'connected',
  'away',
  'disconnected',
]);

export const PlayerDTO = z.object({
  id: z.string(),
  name: z.string(),
  status: PlayerStatusDTO,
  score: z.number().nonnegative().optional(),
  rank: z.number().int().positive().optional(),
  connectionStatus: ConnectionStatusDTO.optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
});

export type PlayerDTO = z.infer<typeof PlayerDTO>;
export type ConnectionStatusDTO = z.infer<typeof ConnectionStatusDTO>;
