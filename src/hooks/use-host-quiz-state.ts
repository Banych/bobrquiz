'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuizDTO } from '@application/dtos/quiz.dto';
import type { RoundSummaryDTO } from '@application/dtos/round-summary.dto';
import { useRealtimeClient } from '@hooks/use-realtime-client';

export const hostQuizQueryKey = (quizId: string) =>
  ['quiz', quizId, 'state'] as const;

const fetchQuizState = async (quizId: string): Promise<QuizDTO> => {
  const response = await fetch(`/api/quiz/${quizId}/state`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? 'Unable to load quiz state.');
  }

  return (await response.json()) as QuizDTO;
};

const postQuizState = async <TResponse = QuizDTO>(
  url: string,
  body?: Record<string, unknown>
): Promise<TResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? 'Request failed.');
  }

  return (await response.json()) as TResponse;
};

export type UseHostQuizStateOptions = {
  quizId: string;
  initialData: QuizDTO;
};

export const useHostQuizState = ({
  quizId,
  initialData,
}: UseHostQuizStateOptions) => {
  const realtimeClient = useRealtimeClient();
  const queryClient = useQueryClient();
  const channelName = `quiz:${quizId}`;
  const [roundSummary, setRoundSummary] = useState<RoundSummaryDTO | null>(
    null
  );

  const applyState = useCallback(
    (nextState: QuizDTO) => {
      queryClient.setQueryData(hostQuizQueryKey(quizId), nextState);
    },
    [queryClient, quizId]
  );

  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe<QuizDTO>(
      channelName,
      'state:update',
      (updatedState) => {
        queryClient.setQueryData(hostQuizQueryKey(quizId), updatedState);
      }
    );

    return unsubscribe;
  }, [channelName, queryClient, quizId, realtimeClient]);

  const startQuizMutation = useMutation({
    mutationFn: () => postQuizState<QuizDTO>('/api/quiz/start', { quizId }),
    onSuccess: applyState,
  });

  const advanceQuestionMutation = useMutation({
    mutationFn: () => postQuizState<QuizDTO>(`/api/quiz/${quizId}/advance`),
    onSuccess: applyState,
  });

  const resetTimerMutation = useMutation({
    mutationFn: (durationSeconds?: number) =>
      postQuizState<QuizDTO>(`/api/quiz/${quizId}/timer/reset`, {
        durationSeconds,
      }),
    onSuccess: applyState,
  });

  const snapshotLeaderboardMutation = useMutation({
    mutationFn: () =>
      postQuizState<QuizDTO>(`/api/quiz/${quizId}/leaderboard/snapshot`),
    onSuccess: applyState,
  });

  const lockQuestionMutation = useMutation({
    mutationFn: () =>
      postQuizState<RoundSummaryDTO>(`/api/quiz/${quizId}/lock-question`),
    onSuccess: (summary) => {
      setRoundSummary(summary);
      // Refetch quiz state to get updated answersLockedAt
      queryClient.invalidateQueries({ queryKey: hostQuizQueryKey(quizId) });
    },
  });

  const finishQuizMutation = useMutation({
    mutationFn: () => postQuizState<QuizDTO>(`/api/quiz/${quizId}/finish`),
    onSuccess: applyState,
  });

  const restartQuizMutation = useMutation({
    mutationFn: () => postQuizState<QuizDTO>(`/api/quiz/${quizId}/reset`),
    onSuccess: applyState,
  });

  const queryResult = useQuery({
    queryKey: hostQuizQueryKey(quizId),
    queryFn: () => fetchQuizState(quizId),
    initialData,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  return {
    ...queryResult,
    startQuiz: startQuizMutation.mutateAsync,
    isStartingQuiz: startQuizMutation.isPending,
    advanceQuestion: advanceQuestionMutation.mutateAsync,
    isAdvancingQuestion: advanceQuestionMutation.isPending,
    resetTimer: resetTimerMutation.mutateAsync,
    isResettingTimer: resetTimerMutation.isPending,
    snapshotLeaderboard: snapshotLeaderboardMutation.mutateAsync,
    isSnapshottingLeaderboard: snapshotLeaderboardMutation.isPending,
    lockQuestion: lockQuestionMutation.mutateAsync,
    isLockingQuestion: lockQuestionMutation.isPending,
    finishQuiz: finishQuizMutation.mutateAsync,
    isFinishingQuiz: finishQuizMutation.isPending,
    restartQuiz: restartQuizMutation.mutateAsync,
    isRestartingQuiz: restartQuizMutation.isPending,
    roundSummary,
    clearRoundSummary: () => setRoundSummary(null),
  } as const;
};
