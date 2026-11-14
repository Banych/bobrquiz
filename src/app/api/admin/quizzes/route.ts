import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';
import { CreateQuizDTO } from '@application/dtos/quiz-admin.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

/**
 * GET /api/admin/quizzes
 * List the signed-in host's quizzes
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizService } = getServices();
    const quizzes = await quizService.listQuizzesByOwner(userId);

    return NextResponse.json(quizzes);
  } catch (error) {
    console.error('[API] List quizzes error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quizzes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/quizzes
 * Create a new quiz (admin)
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = CreateQuizDTO.parse(body);

    const { quizService } = getServices();
    const quizId = await quizService.createQuiz(data, userId);

    return NextResponse.json({ id: quizId }, { status: 201 });
  } catch (error) {
    console.error('[API] Create quiz error:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.message },
        { status: 400 }
      );
    }

    // The per-host quiz cap (LIMIT_REACHED_PREFIX in @domain/value-objects/host-limits)
    if (error instanceof Error && /^Limit reached:/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to create quiz' },
      { status: 500 }
    );
  }
}
