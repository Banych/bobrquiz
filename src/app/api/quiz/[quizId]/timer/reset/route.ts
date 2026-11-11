import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { broadcastQuizState } from '@infrastructure/realtime/broadcast-quiz-state';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

const ParamsSchema = z.object({
  quizId: z.string().min(1),
});

const TimerBodySchema = z
  .object({
    durationSeconds: z.number().int().positive().optional(),
  })
  .partial();

type ErrorResponse = {
  error: string;
};

type RouteContext = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' } satisfies ErrorResponse,
        { status: 401 }
      );
    }

    const { quizId } = ParamsSchema.parse(await params);
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsedBody = TimerBodySchema.parse(body);

    const { quizService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    await quizService.resetTimer(quizId, parsedBody.durationSeconds);
    const quizState = await quizService.getQuizState(quizId);

    try {
      await broadcastQuizState(quizId, quizState);
    } catch (broadcastError) {
      console.warn('Failed to broadcast quiz state after timer reset', {
        quizId,
        error: broadcastError,
      });
    }

    return NextResponse.json(quizState);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to reset quiz timer.';
    const status = /not found/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
