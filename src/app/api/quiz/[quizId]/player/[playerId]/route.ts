import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { broadcastPlayerKicked } from '@infrastructure/realtime/broadcast-player-events';
import type { PlayerSessionDTO } from '@application/dtos/player-session.dto';

const ParamsSchema = z.object({
  quizId: z.string().min(1),
  playerId: z.string().min(1),
});

const DeleteBodySchema = z.object({
  reason: z.enum(['kicked', 'timeout']).default('kicked'),
});

type ErrorResponse = {
  error: string;
};

type RouteContext = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { quizId, playerId } = ParamsSchema.parse(await params);
    const { playerService } = getServices();
    const playerSession = await playerService.getPlayerSession(
      quizId,
      playerId
    );

    return NextResponse.json(playerSession satisfies PlayerSessionDTO);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to load player session.';

    const status = /not found|player/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { quizId, playerId } = ParamsSchema.parse(await params);

    let reason: 'kicked' | 'timeout' = 'kicked';
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      const parsed = DeleteBodySchema.safeParse(body);
      if (parsed.success) {
        reason = parsed.data.reason;
      }
    }

    const { playerService } = getServices();
    await playerService.removePlayer(playerId, quizId, reason);
    await broadcastPlayerKicked(quizId, playerId, reason);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
