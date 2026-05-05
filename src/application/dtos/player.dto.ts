import { z } from 'zod';

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
