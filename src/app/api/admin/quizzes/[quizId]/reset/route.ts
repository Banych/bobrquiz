import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';

type RouteContext = { params: Promise<{ quizId: string }> };
type ErrorResponse = { error: string };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { quizId } = await params;
    const { quizService } = getServices();
    await quizService.resetQuiz(quizId);
    return NextResponse.json({ success: true });
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
