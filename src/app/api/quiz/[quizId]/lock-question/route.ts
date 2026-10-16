import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { broadcastRoundSummary } from '@infrastructure/realtime/broadcast-round-summary';

const ParamsSchema = z.object({
  quizId: z.string().min(1),
});

type ErrorResponse = {
  error: string;
};

type RouteContext = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { quizId } = ParamsSchema.parse(await params);
    const { lockQuestionUseCase } = getServices();

    const roundSummary = await lockQuestionUseCase.execute(quizId);

    // The lock is already persisted: a failed broadcast must not turn into an
    // error the host retries, because the retry is refused as already locked
    try {
      await broadcastRoundSummary(quizId, roundSummary);
    } catch (broadcastError) {
      console.warn('Failed to broadcast round summary after lock', {
        quizId,
        error: broadcastError,
      });
    }

    return NextResponse.json(roundSummary);
  } catch (error) {
    console.error('[API] lock question error:', error);
    const message =
      error instanceof Error ? error.message : 'Unable to lock question.';

    const status = /not found|not active/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
