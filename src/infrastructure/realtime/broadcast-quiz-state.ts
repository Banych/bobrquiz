import type { QuizDTO } from '@application/dtos/quiz.dto';
import { mapQuizToPlayerFacingDTO } from '@application/mappers/player-quiz-mapper';
import { broadcastPool } from './broadcast-channel-pool';
import { getSupabaseServerClient } from './supabase-server-client';

export const broadcastQuizState = async (
  quizId: string,
  quizState: QuizDTO
): Promise<void> => {
  const client = getSupabaseServerClient();

  if (!client) {
    return;
  }

  const channel = `quiz:${quizId}`;

  await broadcastPool.send(client, channel, 'state:update', quizState);

  // Players get a redacted view on the same channel: unrevealed question
  // content and cross-player answers are stripped before this leaves the server.
  await broadcastPool.send(
    client,
    channel,
    'state:update:player',
    mapQuizToPlayerFacingDTO(quizState)
  );
};
