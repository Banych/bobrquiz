import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

/**
 * GET /api/admin/media
 * Lists the files of every quiz the signed-in host owns, newest first.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const files = await getServices().mediaService.listOwnerMedia(userId);
    return NextResponse.json(files);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GET /api/admin/media]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
