import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PlayerJoinForm } from '@/components/player/player-join-form';

export const metadata: Metadata = {
  title: 'Join a Bobr Quiz — Bobr Quiz',
  description: 'Enter a join code to play live multiplayer trivia.',
};

export default function PlayerJoinPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayerJoinForm />
    </Suspense>
  );
}
