'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScoringInfoBadge } from './scoring-info-badge';

const STORAGE_KEY = 'quiz-game-player-session';

type StoredSession = {
  quizId: string;
  playerId: string;
  playerName: string;
};

type JoinResponse = {
  quiz: {
    id: string;
    title: string;
    settings?: {
      scoringAlgorithm?: 'EXPONENTIAL_DECAY' | 'LINEAR' | 'FIXED';
      scoringDecayRate?: number;
    };
  };
  player: {
    id: string;
    name: string;
  };
};

export function PlayerJoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [joinCode, setJoinCode] = useState(
    () => searchParams.get('code')?.toUpperCase() ?? ''
  );
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storedSession, setStoredSession] = useState<StoredSession | null>(
    null
  );
  const [quizInfo, setQuizInfo] = useState<JoinResponse['quiz'] | null>(null);
  const [showKickedMessage] = useState(
    () => searchParams.get('kicked') === 'true'
  );

  // Clear the ?kicked=true param from the URL after mount so it won't
  // re-appear on a manual page refresh.
  useEffect(() => {
    if (searchParams.get('kicked') === 'true') {
      const url = new URL(window.location.href);
      url.searchParams.delete('kicked');
      window.history.replaceState(null, '', url.toString());
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredSession;
        setStoredSession(parsed);
      }
    } catch (storageError) {
      console.warn('Unable to read stored player session', storageError);
    }
  }, []);

  const clearStoredSession = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setStoredSession(null);
    } catch (storageError) {
      console.warn('Unable to clear stored session', storageError);
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedCode = joinCode.trim().toUpperCase();
    const trimmedName = playerName.trim();

    if (!trimmedCode || !trimmedName) {
      setError('Enter both a join code and your name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/session/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          joinCode: trimmedCode,
          playerName: trimmedName,
        }),
      });

      if (!response.ok) {
        const { error: joinError } = (await response
          .json()
          .catch(() => ({}))) as { error?: string };
        throw new Error(joinError ?? 'Unable to join the quiz.');
      }

      const payload = (await response.json()) as JoinResponse;
      const session: StoredSession = {
        quizId: payload.quiz.id,
        playerId: payload.player.id,
        playerName: payload.player.name,
      };

      // Store session in localStorage
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setStoredSession(session);
      } catch (storageError) {
        console.warn('Unable to persist player session', storageError);
      }

      setQuizInfo(payload.quiz);
      setJoinCode('');
      setPlayerName('');
      router.push(`/play/${payload.quiz.id}/${payload.player.id}`);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : 'Unable to join right now. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResume = () => {
    if (!storedSession) {
      return;
    }

    router.push(`/play/${storedSession.quizId}/${storedSession.playerId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-purple-950/40 to-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-6 py-12">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
            Bobr Quiz
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Join the action</h1>
          <p className="mt-2 text-base text-slate-200/80">
            Enter the code from the host screen and pick a display name.
          </p>
          {quizInfo?.settings?.scoringAlgorithm && (
            <div className="mt-4 flex justify-center">
              <ScoringInfoBadge
                algorithm={quizInfo.settings.scoringAlgorithm}
                decayRate={quizInfo.settings.scoringDecayRate}
              />
            </div>
          )}
        </header>

        {showKickedMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-200"
          >
            You were removed from the game by the host.
          </div>
        )}

        <form
          onSubmit={handleJoin}
          className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
        >
          <div className="space-y-5">
            <label className="block text-sm font-medium text-white/80">
              Join code
              <input
                type="text"
                value={joinCode}
                maxLength={16}
                onChange={(event) =>
                  setJoinCode(event.target.value.toUpperCase())
                }
                placeholder="ABCD"
                className="mt-2 w-full rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-lg tracking-[0.4em] text-center uppercase text-white placeholder:text-white/40 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                disabled={isSubmitting}
                inputMode="text"
                autoComplete="off"
              />
            </label>

            <label className="block text-sm font-medium text-white/80">
              Your name
              <input
                type="text"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Alex"
                className="mt-2 w-full rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-lg text-white placeholder:text-white/40 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                disabled={isSubmitting}
                autoComplete="name"
              />
            </label>

            <Button
              type="submit"
              className="w-full rounded-2xl bg-emerald-400 text-base font-semibold text-emerald-950 hover:bg-emerald-300"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Connecting…' : 'Join quiz'}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </form>

        {storedSession ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/80">
            <p className="text-base font-semibold text-white">
              Resume previous session
            </p>
            <p className="mt-1 text-white/70">
              {storedSession.playerName} • Quiz ID{' '}
              {storedSession.quizId.slice(0, 8)}…
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="w-full rounded-2xl bg-white/90 text-base font-semibold text-slate-950 hover:bg-white"
                onClick={handleResume}
              >
                Reopen session
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full rounded-2xl text-white hover:bg-white/10"
                onClick={clearStoredSession}
              >
                Forget this device
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
