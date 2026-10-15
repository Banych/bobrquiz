import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServices } from '@application/services/factories';
import { broadcastAnswerAck } from '@infrastructure/realtime/broadcast-player-events';
import { broadcastLeaderboard } from '@infrastructure/realtime/broadcast-leaderboard';
import { getGlobalBroadcaster } from '@lib/debounce-broadcast';
import { enforceRateLimit } from '@lib/rate-limit';

const SubmitAnswerBodySchema = z.object({
  quizId: z.string().min(1),
  playerId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string().min(1),
});

type ErrorResponse = {
  error: string;
};

// Initialize debounced broadcaster for leaderboard updates
const leaderboardBroadcaster = getGlobalBroadcaster(async (quizId: string) => {
  const { quizService } = getServices();
  const quizState = await quizService.getQuizState(quizId);
  await broadcastLeaderboard(quizId, quizState.leaderboard);
});

export async function POST(request: Request) {
  const rateLimit = enforceRateLimit(request, 'player-answer', {
    limit: 30,
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
    const parsed = SubmitAnswerBodySchema.parse(payload);

    const { answerService } = getServices();
    const result = await answerService.submitAnswer(
      parsed.quizId,
      parsed.playerId,
      parsed.questionId,
      parsed.answer
    );

    // Broadcast acknowledgment to player's private channel
    await broadcastAnswerAck(
      parsed.quizId,
      parsed.playerId,
      result.answerId,
      result.isCorrect
    );

    // Schedule debounced leaderboard broadcast (batched within 500ms)
    leaderboardBroadcaster.schedule(parsed.quizId);

    return NextResponse.json({ status: 'submitted', ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to submit answer.';
    const status = /not found|inactive/i.test(message) ? 404 : 400;

    return NextResponse.json({ error: message } satisfies ErrorResponse, {
      status,
    });
  }
}
