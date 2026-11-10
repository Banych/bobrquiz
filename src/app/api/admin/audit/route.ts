import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const quizId = searchParams.get('quizId') ?? undefined;
    const limitParam = searchParams.get('limit');
    const parsedLimit =
      limitParam != null ? Number.parseInt(limitParam, 10) : undefined;
    const limit =
      parsedLimit != null && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : undefined;

    const { auditService } = getServices();
    const logs = await auditService.listAuditLogs({
      ownerId: userId,
      quizId,
      limit,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('[API] audit log error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
