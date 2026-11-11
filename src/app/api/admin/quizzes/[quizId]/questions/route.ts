import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@application/services/factories';
import {
  CreateQuestionBodyDTO,
  type CreateQuestionDTO,
  QuestionListItemDTO,
} from '@application/dtos/question-admin.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

/**
 * GET /api/admin/quizzes/[quizId]/questions
 * List all questions for a quiz (admin view)
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    const { quizService, questionService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    const questions = await questionService.listQuizQuestions(quizId);

    return NextResponse.json(questions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GET /api/admin/quizzes/[quizId]/questions]', message);

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/quizzes/[quizId]/questions
 * Create a new question for a quiz
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
    const body: unknown = await request.json();

    // Validate the raw body before building anything from it
    const dto: CreateQuestionDTO = {
      ...CreateQuestionBodyDTO.parse(body),
      quizId,
    };

    const { quizService, questionService } = getServices();
    await quizService.assertQuizOwner(quizId, userId);
    const question = await questionService.createQuestion(dto);

    // Return lightweight DTO
    const response: QuestionListItemDTO = {
      id: question.id,
      text: question.text,
      type: question.type,
      points: question.points,
      orderIndex: question.orderIndex ?? 0,
      hasCorrectAnswers: question.correctAnswers.length > 0,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /api/admin/quizzes/[quizId]/questions]', message);

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
