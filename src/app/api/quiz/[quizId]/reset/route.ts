import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { broadcastQuizState } from '@infrastructure/realtime/broadcast-quiz-state';

const ParamsSchema = z.object({
  quizId: z.string().min(1),
});

type ErrorResponse = {
  error: string;
};

type RouteContext = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { quizId } = ParamsSchema.parse(await params);
    const { quizService } = getServices();

    await quizService.resetQuiz(quizId);
    const quizState = await quizService.getQuizState(quizId);

    try {
      await broadcastQuizState(quizId, quizState);
    } catch (broadcastError) {
      console.warn('Failed to broadcast quiz state after reset', {
        quizId,
        error: broadcastError,
      });
    }

    return NextResponse.json(quizState);
  } catch (error) {
    console.error('[API] reset quiz error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to reset quiz.';
    const status = /not found/i.test(message)
      ? 404
      : /cannot reset|invalid state/i.test(message)
        ? 400
        : 500;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
