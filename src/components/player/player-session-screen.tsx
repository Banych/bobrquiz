'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { PlayerSessionDTO } from '@application/dtos/player-session.dto';
import { usePlayerSession } from '@hooks/use-player-session';
import { useCountdownTimer } from '@hooks/use-countdown-timer';
import { useRoundSummaryListener } from '@hooks/use-round-summary-listener';
import { useReconnection } from '@hooks/use-reconnection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ScoringInfoBadge } from './scoring-info-badge';
import { AnswersLockedIndicator } from './answers-locked-indicator';
import { ConnectionStatusBanner } from './connection-status-banner';
import { calculatePoints, getSpeedIndicator } from '@/lib/scoring-client';

interface PlayerSessionScreenProps {
  quizId: string;
  playerId: string;
  initialSession: PlayerSessionDTO;
}

const formatSeconds = (value: number | null | undefined) => {
  if (typeof value !== 'number') {
    return '00:00';
  }

  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
};

export function PlayerSessionScreen({
  quizId,
  playerId,
  initialSession,
}: PlayerSessionScreenProps) {
  const {
    data,
    error,
    isFetching,
    isPending,
    refetch,
    submitAnswer,
    isSubmittingAnswer,
  } = usePlayerSession({
    quizId,
    playerId,
    initialData: initialSession,
  });

  const roundSummary = useRoundSummaryListener(quizId);

  const session = data ?? initialSession;
  const [answerValue, setAnswerValue] = useState('');
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(
    null
  );
  const [reconnectedToast, setReconnectedToast] = useState<string | null>(null);

  // Reconnection management with presence tracking
  const { state: reconnectionState, reconnect } = useReconnection({
    quizId,
    playerId,
    playerName: session.player.name,
    persistToDatabase: true,
    onDisconnected: () => {
      setSubmissionMessage('Connection lost. Trying to reconnect...');
      setReconnectedToast(null);
    },
    onReconnected: () => {
      setReconnectedToast('✓ Reconnected! Your session has been restored.');
      setSubmissionMessage(null);
      // Clear toast after 5 seconds
      setTimeout(() => setReconnectedToast(null), 5000);
    },
    onFailed: () => {
      setSubmissionMessage(
        'Unable to reconnect. Please check your internet connection.'
      );
    },
  });

  // Client-side countdown for smooth timer updates
  const currentRemaining = useCountdownTimer({
    remainingSeconds: session.quiz.timer.remainingSeconds,
    startTime: session.quiz.timer.startTime,
    duration: session.quiz.timer.duration,
    isActive:
      session.quiz.status === 'Active' && !!session.quiz.timer.startTime,
  });

  const activeQuestionId = useMemo(() => {
    return (
      session.quiz.activeQuestionId ??
      session.quiz.questions[session.quiz.currentQuestionIndex]?.id ??
      null
    );
  }, [session.quiz]);

  const questionCount = session.quiz.questions.length;
  const currentQuestionNumber =
    questionCount > 0
      ? Math.min(session.quiz.currentQuestionIndex + 1, questionCount)
      : 0;

  const leaderboardEntry = useMemo(() => {
    return session.quiz.leaderboard?.find(
      (entry) => entry.playerId === session.player.id
    );
  }, [session.player.id, session.quiz.leaderboard]);

  const playerScore = leaderboardEntry?.score ?? session.player.score ?? 0;

  // Calculate live point preview based on elapsed time
  const livePointPreview = useMemo(() => {
    if (!activeQuestionId || !session.quiz.timer.startTime) {
      return null;
    }

    const currentQuestion = session.quiz.questions.find(
      (q) => q.id === activeQuestionId
    );
    if (!currentQuestion) {
      return null;
    }

    const algorithm =
      session.quiz.settings.scoringAlgorithm ?? 'EXPONENTIAL_DECAY';
    const decayRate = session.quiz.settings.scoringDecayRate ?? 2.0;
    const totalTime = session.quiz.timer.duration;
    const timeTaken = Math.max(0, totalTime - (currentRemaining ?? 0));

    return calculatePoints({
      basePoints: currentQuestion.points,
      timeTaken,
      totalTime,
      algorithm,
      decayRate,
    });
  }, [
    activeQuestionId,
    session.quiz.questions,
    session.quiz.settings,
    session.quiz.timer,
    currentRemaining,
  ]);

  const currentQuestion = useMemo(() => {
    if (!activeQuestionId) return null;
    return (
      session.quiz.questions.find((q) => q.id === activeQuestionId) ?? null
    );
  }, [activeQuestionId, session.quiz.questions]);

  const isOptionQuestion =
    currentQuestion?.type === 'multiple-choice' ||
    currentQuestion?.type === 'true/false';

  const questionOptions = useMemo(() => {
    if (!isOptionQuestion || !currentQuestion) return [];
    if (currentQuestion.options?.length) return currentQuestion.options;
    if (currentQuestion.type === 'true/false') return ['True', 'False'];
    return [];
  }, [isOptionQuestion, currentQuestion]);

  // Clear answer selection when the active question changes
  useEffect(() => {
    setAnswerValue('');
    setSubmissionMessage(null);
  }, [activeQuestionId]);

  const handleSubmit = async () => {
    if (!activeQuestionId) {
      setSubmissionMessage(
        'Hang tight — the host will start the next round soon.'
      );
      return;
    }

    const trimmed = answerValue.trim();
    if (!trimmed) {
      setSubmissionMessage('Enter an answer before submitting.');
      return;
    }

    setSubmissionMessage(null);

    // Calculate speed bonus if we have timing info
    let speedBonusMessage = '';
    if (livePointPreview !== null && session.quiz.timer.duration) {
      const totalTime = session.quiz.timer.duration;
      const timeTaken = Math.max(0, totalTime - (currentRemaining ?? 0));
      const speedInfo = getSpeedIndicator(timeTaken, totalTime);
      speedBonusMessage = ` ${speedInfo.emoji} ${speedInfo.label} — ${livePointPreview} pts if correct!`;
    }

    try {
      await submitAnswer({ questionId: activeQuestionId, answer: trimmed });
      setAnswerValue('');
      setSubmissionMessage(
        `Answer received!${speedBonusMessage} You can adjust until the host locks it in.`
      );
    } catch (submitError) {
      setSubmissionMessage(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to send your answer. Please try again.'
      );
    }
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit();
  };

  const waitingForQuestion =
    !activeQuestionId && session.quiz.status !== 'Completed';
  const canSubmit = Boolean(activeQuestionId) && Boolean(answerValue.trim());
  const answersLocked = roundSummary !== null;
  const isDisconnected =
    reconnectionState === 'disconnected' ||
    reconnectionState === 'reconnecting';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Connection Status Banner */}
      <ConnectionStatusBanner state={reconnectionState} onRetry={reconnect} />

      <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <header className="text-center">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">
            Joined as
          </p>
          <h1 className="text-3xl font-semibold">{session.player.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quiz: {session.quiz.title}
          </p>
          {session.quiz.settings.scoringAlgorithm && (
            <div className="mt-3 flex justify-center">
              <ScoringInfoBadge
                algorithm={session.quiz.settings.scoringAlgorithm}
                decayRate={session.quiz.settings.scoringDecayRate}
                className="bg-card/50 border-border text-foreground"
              />
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            Status:{' '}
            <span className="font-semibold">{session.player.status}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Score: <span className="font-mono text-base">{playerScore}</span>
          </p>
        </header>

        {reconnectedToast && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary"
          >
            {reconnectedToast}
          </div>
        )}

        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error instanceof Error
              ? error.message
              : 'Unable to sync with the quiz. Try refreshing.'}
          </div>
        ) : null}

        {answersLocked && (
          <AnswersLockedIndicator roundSummary={roundSummary} />
        )}

        <section className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">
            Round progress
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <p className="text-4xl font-mono">
                {formatSeconds(currentRemaining)}
              </p>
              <p className="text-xs text-muted-foreground">
                Timer • {session.quiz.timer.duration}s total
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">
                {questionCount > 0 ? currentQuestionNumber : 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Question of {questionCount || '—'}
              </p>
            </div>
          </div>
          {livePointPreview !== null && (
            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                If you answer now
              </p>
              <p className="mt-0.5 text-2xl font-bold text-primary">
                {livePointPreview} pts
              </p>
            </div>
          )}
          {waitingForQuestion ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {session.quiz.status === 'Pending'
                ? 'Waiting for the host to start the quiz...'
                : 'Waiting for the host to launch the next question.'}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Submit your answer</h2>
            {isFetching || isPending ? (
              <span className="text-xs uppercase text-muted-foreground">
                Syncing…
              </span>
            ) : null}
          </header>
          <form className="space-y-4" onSubmit={handleFormSubmit}>
            {isOptionQuestion ? (
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Pick your answer
                </Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {questionOptions.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant="outline"
                      disabled={
                        isSubmittingAnswer ||
                        session.quiz.status !== 'Active' ||
                        answersLocked ||
                        isDisconnected
                      }
                      onClick={() => setAnswerValue(option)}
                      className={cn(
                        'h-auto rounded-xl px-4 py-3 text-base',
                        answerValue === option &&
                          'border-primary bg-primary/10 font-semibold text-primary'
                      )}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Your response
                </Label>
                <Input
                  type="text"
                  value={answerValue}
                  disabled={
                    isSubmittingAnswer ||
                    session.quiz.status !== 'Active' ||
                    answersLocked ||
                    isDisconnected
                  }
                  onChange={(event) => setAnswerValue(event.target.value)}
                  placeholder={
                    isDisconnected
                      ? 'Reconnecting…'
                      : answersLocked
                        ? 'Answers are locked'
                        : waitingForQuestion
                          ? 'Waiting for host…'
                          : 'Type your answer'
                  }
                  className="mt-1 h-auto rounded-xl px-4 py-3 text-base"
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={
                isSubmittingAnswer ||
                !canSubmit ||
                session.quiz.status !== 'Active' ||
                answersLocked ||
                isDisconnected
              }
            >
              {isDisconnected
                ? 'Reconnecting…'
                : answersLocked
                  ? 'Answers Locked'
                  : isSubmittingAnswer
                    ? 'Sending…'
                    : 'Send answer'}
            </Button>
          </form>
          {submissionMessage ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 text-sm text-muted-foreground"
            >
              {submissionMessage}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card/80 p-4 text-sm text-muted-foreground">
          <p>
            Connected players: {session.quiz.players.length}. Keep this tab open
            so we can record your latency and results. If things look frozen,
            tap the button below to sync.
          </p>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => refetch()}
            disabled={isFetching || isSubmittingAnswer}
          >
            {isFetching ? 'Refreshing…' : 'Sync now'}
          </Button>
        </section>
      </div>
    </div>
  );
}
