import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import type { PlayerConnectionStatusDTO } from '@application/dtos/player-connection-status.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

const ParamsSchema = z.object({
  quizId: z.string().min(1),
});

type ErrorResponse = {
  error: string;
};

type SuccessResponse = PlayerConnectionStatusDTO[];

type RouteContext = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

/**
 * GET /api/quiz/[quizId]/players/status
 *
 * Returns the connection status of all players in a quiz session.
 * Used by hosts to monitor player connections during a quiz.
 *
 * Response:
 * [
 *   {
 *     playerId: string,
 *     name: string,
 *     connectionStatus: 'connected' | 'away' | 'disconnected',
 *     lastSeenAt: ISO8601 timestamp or null
 *   }
 * ]
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' } satisfies ErrorResponse,
        { status: 401 }
      );
    }

    const { quizId } = ParamsSchema.parse(await params);
    const { quizService, getPlayerConnectionStatusUseCase } = getServices();
    await quizService.assertQuizOwner(quizId, userId);

    const playerStatuses =
      await getPlayerConnectionStatusUseCase.execute(quizId);

    return NextResponse.json(playerStatuses satisfies SuccessResponse);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to load player connection status.';

    const status = /not found/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
