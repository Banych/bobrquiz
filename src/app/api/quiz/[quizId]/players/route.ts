import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import type { PlayerDTO } from '@application/dtos/player.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

const ParamsSchema = z.object({
  quizId: z.string().min(1),
});

type ErrorResponse = {
  error: string;
};

type SuccessResponse = {
  quizId: string;
  players: PlayerDTO[];
};

type RouteContext = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

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
    const { quizService, playerService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    const players = await playerService.listPlayersForQuiz(quizId);

    return NextResponse.json({ quizId, players } satisfies SuccessResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to load quiz players.';

    const status = /not found/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
