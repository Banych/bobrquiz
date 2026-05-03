'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { QuizDTO } from '@application/dtos/quiz.dto';
import { useHostQuizState } from '@/hooks/use-host-quiz-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TimerCountdown } from './timer-countdown';
import { QuestionTimeline } from './question-timeline';
import { ScoringInfoBadge } from '@/components/player/scoring-info-badge';
import { RoundSummaryDialog } from './round-summary-dialog';
import { PlayerListWithStatus } from './player-list-with-status';

interface HostQuizDashboardProps {
  quizId: string;
  initialQuiz: QuizDTO;
}

export function HostQuizDashboard({
  quizId,
  initialQuiz,
}: HostQuizDashboardProps) {
  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
    startQuiz,
    isStartingQuiz,
    advanceQuestion,
    isAdvancingQuestion,
    resetTimer,
    isResettingTimer,
    snapshotLeaderboard,
    isSnapshottingLeaderboard,
    lockQuestion,
    isLockingQuestion,
    finishQuiz,
    isFinishingQuiz,
    restartQuiz,
    isRestartingQuiz,
    roundSummary,
    clearRoundSummary,
  } = useHostQuizState({
    quizId,
    initialData: initialQuiz,
  });

  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = (action: () => Promise<unknown>) => {
    setActionError(null);
    action().catch((actionErr) => {
      setActionError(
        actionErr instanceof Error
          ? actionErr.message
          : 'Something went wrong. Please try again.'
      );
    });
  };

  const quiz = data ?? initialQuiz;

  const activeQuestion = useMemo(() => {
    return quiz.questions[quiz.currentQuestionIndex] ?? null;
  }, [quiz]);

  const leaderboard = quiz.leaderboard ?? [];
  const isMutating =
    isStartingQuiz ||
    isAdvancingQuestion ||
    isResettingTimer ||
    isSnapshottingLeaderboard ||
    isLockingQuestion ||
    isFinishingQuiz ||
    isRestartingQuiz;
  const canControlTimer = quiz.status === 'Active';
  const canAdvance = quiz.status === 'Active' && quiz.questions.length > 0;
  const canLockQuestion =
    quiz.status === 'Active' &&
    activeQuestion &&
    !activeQuestion.answersLockedAt;
  const hasActiveTimer = typeof quiz.timer.remainingSeconds === 'number';

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">
              Host Dashboard
            </p>
            <h1 className="text-3xl font-semibold">{quiz.title}</h1>
            <p className="text-sm text-muted-foreground">
              Join code:{' '}
              <span className="font-mono text-base">
                {quiz.joinCode ?? '—'}
              </span>
            </p>
            {quiz.settings.scoringAlgorithm && (
              <div className="mt-2">
                <ScoringInfoBadge
                  algorithm={quiz.settings.scoringAlgorithm}
                  decayRate={quiz.settings.scoringDecayRate}
                  className="bg-card/50 border-border text-foreground"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'rounded-full px-4 py-1 text-sm font-medium capitalize',
                quiz.status === 'Active' && 'bg-green-600/15 text-green-600',
                quiz.status === 'Pending' && 'bg-amber-500/15 text-amber-500',
                quiz.status === 'Completed' && 'bg-blue-600/15 text-blue-600'
              )}
            >
              {quiz.status}
            </span>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isPending || isMutating}
            >
              Sync now {isFetching ? '…' : ''}
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error instanceof Error
              ? error.message
              : 'Unable to load quiz state.'}
          </div>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Controls</h2>
            {isMutating ? (
              <span className="text-xs uppercase text-muted-foreground">
                Updating…
              </span>
            ) : null}
          </header>
          <div className="flex flex-wrap gap-3">
            {quiz.status === 'Pending' && (
              <Button
                disabled={isStartingQuiz}
                onClick={() => runAction(() => startQuiz())}
              >
                {isStartingQuiz ? 'Starting…' : 'Start quiz'}
              </Button>
            )}
            {quiz.status === 'Active' && (
              <>
                <Button asChild variant="outline">
                  <Link href={`/quiz/${quizId}/live`}>Open Live View</Link>
                </Button>
                <Button
                  variant="destructive"
                  disabled={isFinishingQuiz}
                  onClick={() => runAction(() => finishQuiz())}
                >
                  {isFinishingQuiz ? 'Finishing…' : 'Finish quiz'}
                </Button>
              </>
            )}
            {quiz.status === 'Completed' && (
              <Button
                variant="outline"
                disabled={isRestartingQuiz}
                onClick={() => runAction(() => restartQuiz())}
              >
                {isRestartingQuiz ? 'Restarting…' : 'Restart quiz'}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={!canAdvance || isAdvancingQuestion}
              onClick={() => runAction(() => advanceQuestion())}
            >
              {isAdvancingQuestion ? 'Advancing…' : 'Next question'}
            </Button>
            <Button
              variant="outline"
              disabled={!canControlTimer || isResettingTimer}
              onClick={() => runAction(() => resetTimer(undefined))}
            >
              {isResettingTimer ? 'Resetting…' : 'Reset timer'}
            </Button>
            <Button
              variant={canLockQuestion ? 'default' : 'ghost'}
              disabled={!canLockQuestion || isLockingQuestion}
              onClick={() => runAction(() => lockQuestion())}
            >
              {isLockingQuestion ? 'Locking…' : 'Lock Question'}
            </Button>
            <Button
              variant="ghost"
              disabled={isSnapshottingLeaderboard}
              onClick={() => runAction(() => snapshotLeaderboard())}
            >
              {isSnapshottingLeaderboard ? 'Saving…' : 'Snapshot leaderboard'}
            </Button>
          </div>
          {actionError ? (
            <p className="mt-3 text-sm text-destructive">{actionError}</p>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Settings</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Time per question</p>
                <p className="font-mono text-lg">
                  {quiz.settings.timePerQuestion}s
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Skip allowed</p>
                <p className="font-medium">
                  {quiz.settings.allowSkipping ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Scoring</p>
                <p className="font-medium">
                  {quiz.settings.scoringAlgorithm === 'EXPONENTIAL_DECAY' &&
                    'Speed Scoring'}
                  {quiz.settings.scoringAlgorithm === 'LINEAR' && 'Balanced'}
                  {quiz.settings.scoringAlgorithm === 'FIXED' && 'Fixed Points'}
                  {!quiz.settings.scoringAlgorithm && 'Default'}
                </p>
                {quiz.settings.scoringAlgorithm === 'EXPONENTIAL_DECAY' &&
                  quiz.settings.scoringDecayRate && (
                    <p className="text-xs text-muted-foreground">
                      Rate: {quiz.settings.scoringDecayRate.toFixed(1)}
                    </p>
                  )}
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Timer</h2>
            <div className="flex items-center justify-center">
              <TimerCountdown
                duration={quiz.timer.duration}
                remainingSeconds={quiz.timer.remainingSeconds}
                startTime={quiz.timer.startTime}
                size="large"
              />
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Current question:{' '}
                {activeQuestion ? activeQuestion.text : 'No active question'}
              </p>
              {!hasActiveTimer && canControlTimer ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Timer paused — reset to restart countdown.
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Leaderboard</h2>
              <span className="text-xs uppercase text-muted-foreground">
                {leaderboard.length} players
              </span>
            </header>
            <ul className="mt-4 space-y-2">
              {leaderboard.length === 0 ? (
                <li className="text-sm text-muted-foreground">
                  No scores yet.
                </li>
              ) : (
                leaderboard.map((entry, index) => (
                  <li
                    key={entry.playerId}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                  >
                    <span className="font-semibold">#{index + 1}</span>
                    <span className="flex-1 px-3 text-sm text-muted-foreground">
                      {quiz.players.find(
                        (player) => player.id === entry.playerId
                      )?.name ?? entry.playerId}
                    </span>
                    <span className="font-mono text-lg">{entry.score}</span>
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>

        <QuestionTimeline
          questions={quiz.questions}
          activeQuestionId={quiz.activeQuestionId}
          currentQuestionIndex={quiz.currentQuestionIndex}
        />

        <PlayerListWithStatus quizId={quizId} pollInterval={5000} />
      </div>

      <RoundSummaryDialog summary={roundSummary} onClose={clearRoundSummary} />
    </div>
  );
}
