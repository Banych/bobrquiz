import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

const mocks = vi.hoisted(() => ({
  quizService: {
    assertQuizOwner: vi.fn(),
    startQuiz: vi.fn(),
    endQuiz: vi.fn(),
    getQuizState: vi.fn(),
    advanceToNextQuestion: vi.fn(),
    resetTimer: vi.fn(),
    snapshotLeaderboard: vi.fn(),
    resetQuiz: vi.fn(),
  },
  playerService: {
    listPlayersForQuiz: vi.fn(),
    removePlayer: vi.fn(),
    getPlayerSession: vi.fn(),
  },
  lockQuestion: vi.fn(),
  connectionStatus: vi.fn(),
  flush: vi.fn(),
  broadcastQuizState: vi.fn(),
  broadcastRoundSummary: vi.fn(),
  broadcastPlayerKicked: vi.fn(),
}));

vi.mock('@application/services/factories', () => ({
  getServices: () => ({
    quizService: mocks.quizService,
    playerService: mocks.playerService,
    lockQuestionUseCase: { execute: mocks.lockQuestion },
    getPlayerConnectionStatusUseCase: { execute: mocks.connectionStatus },
  }),
}));
vi.mock('@infrastructure/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(),
}));
vi.mock('@lib/debounce-broadcast', () => ({
  getGlobalBroadcaster: () => ({ flush: mocks.flush }),
}));
vi.mock('@infrastructure/realtime/broadcast-quiz-state', () => ({
  broadcastQuizState: mocks.broadcastQuizState,
}));
vi.mock('@infrastructure/realtime/broadcast-round-summary', () => ({
  broadcastRoundSummary: mocks.broadcastRoundSummary,
}));
vi.mock('@infrastructure/realtime/broadcast-player-events', () => ({
  broadcastPlayerKicked: mocks.broadcastPlayerKicked,
}));
vi.mock('@infrastructure/realtime/broadcast-leaderboard', () => ({
  broadcastLeaderboard: vi.fn(),
}));

import { POST as start } from '@/app/api/quiz/start/route';
import { POST as advance } from '@/app/api/quiz/[quizId]/advance/route';
import { POST as finish } from '@/app/api/quiz/[quizId]/finish/route';
import { POST as lock } from '@/app/api/quiz/[quizId]/lock-question/route';
import { POST as reset } from '@/app/api/quiz/[quizId]/reset/route';
import { POST as resetTimer } from '@/app/api/quiz/[quizId]/timer/reset/route';
import { POST as snapshot } from '@/app/api/quiz/[quizId]/leaderboard/snapshot/route';
import { GET as players } from '@/app/api/quiz/[quizId]/players/route';
import { GET as playersStatus } from '@/app/api/quiz/[quizId]/players/status/route';
import {
  GET as playerSession,
  DELETE as kick,
} from '@/app/api/quiz/[quizId]/player/[playerId]/route';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const notFound = (quizId: string) =>
  new Error(`Quiz with ID ${quizId} not found`);

const ctx = { params: Promise.resolve({ quizId: A_QUIZ }) };
const post = (body?: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

type HostRoute = {
  name: string;
  call: () => Promise<Response>;
  action: Mock;
  actionArgs: unknown[];
};

const hostRoutes: HostRoute[] = [
  {
    name: 'POST start',
    call: () => start(post({ quizId: A_QUIZ })),
    action: mocks.quizService.startQuiz,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'POST advance',
    call: () => advance(post(), ctx),
    action: mocks.quizService.advanceToNextQuestion,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'POST finish',
    call: () => finish(post(), ctx),
    action: mocks.quizService.endQuiz,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'POST lock-question',
    call: () => lock(post(), ctx),
    action: mocks.lockQuestion,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'POST reset',
    call: () => reset(post(), ctx),
    action: mocks.quizService.resetQuiz,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'POST timer/reset',
    call: () => resetTimer(post({ durationSeconds: 20 }), ctx),
    action: mocks.quizService.resetTimer,
    actionArgs: [A_QUIZ, 20],
  },
  {
    name: 'POST leaderboard/snapshot',
    call: () => snapshot(post(), ctx),
    action: mocks.quizService.snapshotLeaderboard,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'GET players',
    call: () => players(new Request('http://localhost/api'), ctx),
    action: mocks.playerService.listPlayersForQuiz,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'GET players/status',
    call: () => playersStatus(new Request('http://localhost/api'), ctx),
    action: mocks.connectionStatus,
    actionArgs: [A_QUIZ],
  },
  {
    name: 'DELETE player (kick)',
    call: () =>
      kick(new Request('http://localhost/api', { method: 'DELETE' }), {
        params: Promise.resolve({ quizId: A_QUIZ, playerId: 'player-1' }),
      }),
    action: mocks.playerService.removePlayer,
    actionArgs: ['player-1', A_QUIZ, 'kicked'],
  },
];

const broadcasts = () => [
  mocks.broadcastQuizState,
  mocks.broadcastRoundSummary,
  mocks.broadcastPlayerKicked,
];

describe('Host quiz routes ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.quizService.assertQuizOwner.mockImplementation(
      async (quizId: string, ownerId: string) => {
        if (quizId !== A_QUIZ || ownerId !== HOST_A) throw notFound(quizId);
      }
    );
    mocks.quizService.getQuizState.mockResolvedValue({ id: A_QUIZ });
    mocks.playerService.listPlayersForQuiz.mockResolvedValue([]);
    mocks.lockQuestion.mockResolvedValue({ questionId: 'q1' });
    mocks.connectionStatus.mockResolvedValue([]);
    vi.mocked(getCurrentUserId).mockResolvedValue(HOST_A);
  });

  it.each(hostRoutes)(
    '$name: the owner passes the owner check before the action runs',
    async ({ call, action, actionArgs }) => {
      const response = await call();

      expect(response.status).toBe(200);
      expect(mocks.quizService.assertQuizOwner).toHaveBeenCalledWith(
        A_QUIZ,
        HOST_A
      );
      expect(action).toHaveBeenCalledWith(...actionArgs);
      expect(
        mocks.quizService.assertQuizOwner.mock.invocationCallOrder[0]
      ).toBeLessThan(action.mock.invocationCallOrder[0]);
    }
  );

  it.each(hostRoutes)(
    '$name: another host gets the missing-quiz 404 and nothing runs',
    async ({ call, action }) => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);

      const response = await call();

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: notFound(A_QUIZ).message,
      });
      expect(action).not.toHaveBeenCalled();
      expect(mocks.flush).not.toHaveBeenCalled();
      broadcasts().forEach((broadcast) =>
        expect(broadcast).not.toHaveBeenCalled()
      );
    }
  );

  it.each(hostRoutes)(
    '$name: no session gets 401 and nothing runs',
    async ({ call, action }) => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);

      const response = await call();

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(mocks.quizService.assertQuizOwner).not.toHaveBeenCalled();
      expect(action).not.toHaveBeenCalled();
      broadcasts().forEach((broadcast) =>
        expect(broadcast).not.toHaveBeenCalled()
      );
    }
  );

  it('GET player session stays anonymous', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null);
    mocks.playerService.getPlayerSession.mockResolvedValue({ playerId: 'p1' });

    const response = await playerSession(new Request('http://localhost/api'), {
      params: Promise.resolve({ quizId: A_QUIZ, playerId: 'p1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.playerService.getPlayerSession).toHaveBeenCalledWith(
      A_QUIZ,
      'p1'
    );
    expect(getCurrentUserId).not.toHaveBeenCalled();
    expect(mocks.quizService.assertQuizOwner).not.toHaveBeenCalled();
  });
});
