import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { enforceRateLimit } from '@lib/rate-limit';

const AddPlayerBodySchema = z.object({
  quizId: z.string().min(1),
  playerName: z.string().min(1),
  playerId: z.string().uuid().optional(),
});

type ErrorResponse = {
  error: string;
};

export async function POST(request: Request) {
  const rateLimit = enforceRateLimit(request, 'player-add', {
    limit: 10,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' } satisfies ErrorResponse,
      { status: 429 }
    );
  }

  try {
    const payload = await request.json();
    const parsed = AddPlayerBodySchema.parse(payload);

    const { playerService } = getServices();
    const playerId = parsed.playerId ?? randomUUID();

    await playerService.addPlayer(parsed.quizId, playerId, parsed.playerName);
    const playerSession = await playerService.getPlayerSession(
      parsed.quizId,
      playerId
    );

    return NextResponse.json({
      quizId: parsed.quizId,
      player: playerSession.player,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to add player.';

    const status = /not found/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
