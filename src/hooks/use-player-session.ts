'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlayerSessionDTO } from '@application/dtos/player-session.dto';
import type { QuizDTO } from '@application/dtos/quiz.dto';
import { useRealtimeClient } from '@hooks/use-realtime-client';

export const playerSessionQueryKey = (quizId: string, playerId: string) =>
  ['player-session', quizId, playerId] as const;

const fetchPlayerSession = async (
  quizId: string,
  playerId: string
): Promise<PlayerSessionDTO> => {
  const response = await fetch(`/api/quiz/${quizId}/player/${playerId}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? 'Unable to load player session.');
  }

  return (await response.json()) as PlayerSessionDTO;
};

const submitPlayerAnswer = async (input: {
  quizId: string;
  playerId: string;
  questionId: string;
  answer: string;
}) => {
  const response = await fetch('/api/player/answer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? 'Failed to submit answer.');
  }

  return (await response.json()) as { status: string };
};

export type UsePlayerSessionOptions = {
  quizId: string;
  playerId: string;
  initialData: PlayerSessionDTO;
};

export const usePlayerSession = ({
  quizId,
  playerId,
  initialData,
}: UsePlayerSessionOptions) => {
  const realtimeClient = useRealtimeClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = playerSessionQueryKey(quizId, playerId);
  const quizChannelName = `quiz:${quizId}`;
  const playerChannelName = `player:${quizId}:${playerId}`;

  const applyQuizState = useCallback(
    (nextQuizState: QuizDTO) => {
      queryClient.setQueryData<PlayerSessionDTO | undefined>(
        queryKey,
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            quiz: nextQuizState,
          };
        }
      );
    },
    [queryClient, queryKey]
  );

  // Subscribe to quiz state updates
  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe<QuizDTO>(
      quizChannelName,
      'state:update:player',
      (updatedState) => {
        applyQuizState(updatedState);
      }
    );

    return unsubscribe;
  }, [applyQuizState, quizChannelName, realtimeClient]);

  // Subscribe to player-specific events (answer acknowledgments)
  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe<{
      answerId: string;
      isCorrect: boolean | null;
      timestamp: string;
    }>(playerChannelName, 'answer:ack', (ack) => {
      // Optimistically update UI or show feedback
      if (process.env.NODE_ENV === 'development') {
        console.log('Answer acknowledged:', ack);
      }

      // Invalidate to refetch updated session with latest answers
      void queryClient.invalidateQueries({ queryKey });
    });

    return unsubscribe;
  }, [playerChannelName, realtimeClient, queryClient, queryKey]);

  // Subscribe to player kick events
  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe<Record<string, never>>(
      playerChannelName,
      'player:kicked',
      () => {
        router.push('/join?kicked=true');
      }
    );

    return unsubscribe;
  }, [playerChannelName, realtimeClient, router]);

  const submitAnswerMutation = useMutation({
    mutationFn: ({
      questionId,
      answer,
    }: {
      questionId: string;
      answer: string;
    }) => submitPlayerAnswer({ quizId, playerId, questionId, answer }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const queryResult = useQuery({
    queryKey,
    queryFn: () => fetchPlayerSession(quizId, playerId),
    initialData,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  return {
    ...queryResult,
    submitAnswer: submitAnswerMutation.mutateAsync,
    isSubmittingAnswer: submitAnswerMutation.isPending,
  } as const;
};
