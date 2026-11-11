import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

/**
 * GET /api/admin/questions
 * List questions across the signed-in user's quizzes, optionally filtered by
 * quizId or type
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const quizId = searchParams.get('quizId') ?? undefined;
    const type = searchParams.get('type') ?? undefined;

    const { questionService } = getServices();
    const questions = await questionService.listAllQuestions({
      ownerId: userId,
      quizId,
      type,
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error('[API] list all questions error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
