import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@application/services/factories';
import {
  UpdateQuestionDTO,
  QuestionListItemDTO,
  QuestionAdminDTO,
} from '@application/dtos/question-admin.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

type RouteContext = {
  params: Promise<{ quizId: string; questionId: string }>;
};

/**
 * GET /api/admin/quizzes/[quizId]/questions/[questionId]
 * Get full question details (including options and correctAnswers)
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId, questionId } = await context.params;
    const { quizService, questionService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    const question = await questionService.getQuizQuestion(quizId, questionId);

    // Return full admin DTO with sensitive fields
    const response: QuestionAdminDTO = {
      id: question.id,
      quizId: question.quizId ?? '',
      text: question.text,
      type: question.type,
      options: question.options ?? [],
      correctAnswers: question.correctAnswers,
      points: question.points,
      orderIndex: question.orderIndex ?? 0,
      createdAt: (question.createdAt ?? new Date()).toISOString(),
      updatedAt: (question.updatedAt ?? new Date()).toISOString(),
      mediaUrl: question.media ?? null,
      mediaType: question.mediaType ?? null,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '[GET /api/admin/quizzes/[quizId]/questions/[questionId]]',
      message
    );

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/quizzes/[quizId]/questions/[questionId]
 * Update an existing question
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId, questionId } = await context.params;
    const body = await request.json();

    // Validate and parse request body
    const dto = UpdateQuestionDTO.parse(body);

    const { quizService, questionService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    const question = await questionService.updateQuestion(
      quizId,
      questionId,
      dto
    );

    // Return lightweight DTO
    const response: QuestionListItemDTO = {
      id: question.id,
      text: question.text,
      type: question.type,
      points: question.points,
      orderIndex: question.orderIndex ?? 0,
      hasCorrectAnswers: question.correctAnswers.length > 0,
      mediaUrl: question.media ?? null,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '[PATCH /api/admin/quizzes/[quizId]/questions/[questionId]]',
      message
    );

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/admin/quizzes/[quizId]/questions/[questionId]
 * Delete a question
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId, questionId } = await context.params;
    const { quizService, questionService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    await questionService.deleteQuestion(quizId, questionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '[DELETE /api/admin/quizzes/[quizId]/questions/[questionId]]',
      message
    );

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
