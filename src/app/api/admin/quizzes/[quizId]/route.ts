import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';
import { UpdateQuizDTO } from '@application/dtos/quiz-admin.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

/**
 * GET /api/admin/quizzes/[quizId]
 * Get quiz details (admin)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    const { quizService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    const quiz = await quizService.getQuizState(quizId);

    return NextResponse.json(quiz);
  } catch (error) {
    console.error('[API] Get quiz error:', error);

    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch quiz' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/quizzes/[quizId]
 * Update quiz (admin)
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    const body = await request.json();
    const data = UpdateQuizDTO.parse(body);

    const { quizService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    await quizService.updateQuiz(quizId, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Update quiz error:', error);

    if (error instanceof Error) {
      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.message },
          { status: 400 }
        );
      }

      if (/not found/i.test(error.message)) {
        return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
      }

      if (/only update quizzes in Pending status/i.test(error.message)) {
        return NextResponse.json(
          { error: 'Can only update quizzes in Pending status' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update quiz' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/quizzes/[quizId]
 * Delete quiz (admin)
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    const { quizService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    await quizService.deleteQuiz(quizId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete quiz error:', error);

    if (error instanceof Error) {
      // Deleting also removes the quiz's media, so a storage error such as
      // "Bucket not found" must stay a 500, not read as a missing quiz. The
      // second message is Prisma's when another delete removed the row first.
      if (
        /^Quiz with ID .+ not found/.test(error.message) ||
        /No record was found for a delete/.test(error.message)
      ) {
        return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
      }

      if (/Cannot delete an active quiz/i.test(error.message)) {
        return NextResponse.json(
          { error: 'Cannot delete an active quiz' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to delete quiz' },
      { status: 500 }
    );
  }
}
