import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@application/services/factories';
import { ReorderQuestionsDTO } from '@application/dtos/question-admin.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

/**
 * POST /api/admin/quizzes/[quizId]/questions/reorder
 * Reorder questions via drag-drop
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    const body = await request.json();

    // Validate and parse request body
    const dto = ReorderQuestionsDTO.parse(body);

    const { quizService, questionService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    await questionService.reorderQuestions(dto, quizId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '[POST /api/admin/quizzes/[quizId]/questions/reorder]',
      message
    );

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
