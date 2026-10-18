import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { enforceRateLimit, resolveRateLimit } from '@lib/rate-limit';

const JoinSessionBodySchema = z.object({
  joinCode: z.string().min(4),
  playerName: z.string().min(1),
});

const SESSION_JOIN_LIMIT = resolveRateLimit(
  process.env.SESSION_JOIN_RATE_LIMIT,
  10,
  'SESSION_JOIN_RATE_LIMIT'
);

type ErrorResponse = {
  error: string;
};

export async function POST(request: Request) {
  const rateLimit = enforceRateLimit(request, 'session-join', {
    limit: SESSION_JOIN_LIMIT,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' } satisfies ErrorResponse,
      { status: 429 }
    );
  }

  try {
    const payload = await request.json();
    const parsedBody = JoinSessionBodySchema.parse(payload);

    const { joinSessionUseCase, playerService } = getServices();
    const quizDto = await joinSessionUseCase.execute(parsedBody.joinCode);

    const playerId = randomUUID();
    await playerService.addPlayer(quizDto.id, playerId, parsedBody.playerName);
    const playerSession = await playerService.getPlayerSession(
      quizDto.id,
      playerId
    );
    const players = await playerService.listPlayersForQuiz(quizDto.id);

    const response = {
      quiz: quizDto,
      player: playerSession.player,
      players,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to join the session.';

    const status = /not found/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
