import { NextResponse, type NextRequest } from 'next/server';
import { getServices } from '@application/services/factories';
import { MAX_MEDIA_BYTES } from '@application/dtos/media.dto';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

type RouteContext = { params: Promise<{ quizId: string }> };

/** Room for the multipart boundary and headers around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * POST /api/admin/quizzes/[quizId]/media
 * Uploads one question image (multipart field `file`) into the quiz's folder.
 * 401 without a session, 404 for a missing or someone else's quiz, 400 for a
 * bad file or a host at the file cap.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MEDIA_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return NextResponse.json(
        { error: 'Invalid media: the file is larger than 4 MB' },
        { status: 400 }
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid media: send one file in the "file" field' },
        { status: 400 }
      );
    }

    const result = await getServices().mediaService.uploadQuizMedia({
      quizId,
      ownerId: userId,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /api/admin/quizzes/[quizId]/media]', message);

    // Only the use cases' own not-found errors; a storage error such as
    // "Bucket not found" is a misconfiguration and stays a 500.
    if (/^(Quiz with ID .+ not found|Media file not found)/.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (/^(Invalid media|Media limit reached)/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
