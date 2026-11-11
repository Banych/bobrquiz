import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

type RouteContext = { params: Promise<{ quizId: string; fileName: string }> };

/**
 * DELETE /api/admin/quizzes/[quizId]/media/[fileName]
 * Deletes one file from the quiz's folder. 401 without a session, 404 for a
 * missing or someone else's quiz or a missing file, 400 for a name that is not
 * a media file name.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId, fileName } = await context.params;
    await getServices().mediaService.deleteQuizMedia({
      quizId,
      ownerId: userId,
      fileName,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '[DELETE /api/admin/quizzes/[quizId]/media/[fileName]]',
      message
    );

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (/^Invalid media/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
