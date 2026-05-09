import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';

const PresenceRequestSchema = z.object({
  timestamp: z.string().datetime().optional(),
});

type RouteParams = {
  params: Promise<{
    quizId: string;
    playerId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { quizId, playerId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = PresenceRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { playerService } = getServices();
    const timestamp = parsed.data.timestamp
      ? new Date(parsed.data.timestamp)
      : new Date();

    await playerService.updatePresence(playerId, timestamp);

    return NextResponse.json({
      success: true,
      lastSeenAt: timestamp.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (/not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
