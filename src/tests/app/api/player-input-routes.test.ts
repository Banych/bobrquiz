import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_ANSWER_MAX_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
} from '@application/dtos/player-input-limits';

// Issue 157: the public player routes cap the name and the answer, and an
// oversized value is a 400 that never reaches a service.

const mocks = vi.hoisted(() => ({
  joinExecute: vi.fn(),
  addPlayer: vi.fn(),
  getPlayerSession: vi.fn(),
  listPlayersForQuiz: vi.fn(),
  submitAnswer: vi.fn(),
  broadcastAnswerAck: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('@application/services/factories', () => ({
  getServices: () => ({
    joinSessionUseCase: { execute: mocks.joinExecute },
    playerService: {
      addPlayer: mocks.addPlayer,
      getPlayerSession: mocks.getPlayerSession,
      listPlayersForQuiz: mocks.listPlayersForQuiz,
    },
    answerService: { submitAnswer: mocks.submitAnswer },
  }),
}));

vi.mock('@lib/rate-limit', () => ({
  enforceRateLimit: () => ({ allowed: true }),
  resolveRateLimit: () => 10,
}));

vi.mock('@infrastructure/realtime/broadcast-player-events', () => ({
  broadcastAnswerAck: mocks.broadcastAnswerAck,
}));

vi.mock('@infrastructure/realtime/broadcast-leaderboard', () => ({
  broadcastLeaderboard: vi.fn(),
}));

vi.mock('@lib/debounce-broadcast', () => ({
  getGlobalBroadcaster: () => ({ schedule: mocks.schedule }),
}));

import { POST as joinSession } from '@/app/api/session/join/route';
import { POST as addPlayer } from '@/app/api/player/add/route';
import { POST as submitAnswer } from '@/app/api/player/answer/route';

const QUIZ_ID = 'quiz-1';
const PLAYER_ID = '6f1c1a52-8a39-4a4e-9a5e-0f7b9c3d2e11';

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const tooLongName = 'a'.repeat(PLAYER_NAME_MAX_LENGTH + 1);
const longestName = 'a'.repeat(PLAYER_NAME_MAX_LENGTH);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.joinExecute.mockResolvedValue({ id: QUIZ_ID });
  mocks.addPlayer.mockResolvedValue(undefined);
  mocks.getPlayerSession.mockResolvedValue({
    player: { id: PLAYER_ID, name: longestName, status: 'Active' },
  });
  mocks.listPlayersForQuiz.mockResolvedValue([]);
  mocks.submitAnswer.mockResolvedValue({
    answerId: 'answer-1',
    isCorrect: true,
  });
  mocks.broadcastAnswerAck.mockResolvedValue(undefined);
});

describe('POST /api/session/join', () => {
  const join = (playerName: string) =>
    joinSession(
      post('/api/session/join', { joinCode: 'JOIN-ABCD', playerName })
    );

  it('rejects a name over the cap with 400 before any lookup', async () => {
    const response = await join(tooLongName);

    expect(response.status).toBe(400);
    expect(mocks.joinExecute).not.toHaveBeenCalled();
    expect(mocks.addPlayer).not.toHaveBeenCalled();
  });

  it('rejects a blank name with 400', async () => {
    const response = await join('   ');

    expect(response.status).toBe(400);
    expect(mocks.addPlayer).not.toHaveBeenCalled();
  });

  it('adds a player whose name is at the cap, trimmed', async () => {
    const response = await join(`  ${longestName}  `);

    expect(response.status).toBe(200);
    expect(mocks.addPlayer).toHaveBeenCalledWith(
      QUIZ_ID,
      expect.any(String),
      longestName
    );
  });
});

describe('POST /api/player/add', () => {
  const add = (playerName: string) =>
    addPlayer(post('/api/player/add', { quizId: QUIZ_ID, playerName }));

  it('rejects a name over the cap with 400', async () => {
    const response = await add(tooLongName);

    expect(response.status).toBe(400);
    expect(mocks.addPlayer).not.toHaveBeenCalled();
  });

  it('rejects a blank name with 400', async () => {
    const response = await add('   ');

    expect(response.status).toBe(400);
    expect(mocks.addPlayer).not.toHaveBeenCalled();
  });

  it('adds a player whose name is at the cap', async () => {
    const response = await add(longestName);

    expect(response.status).toBe(200);
    expect(mocks.addPlayer).toHaveBeenCalledWith(
      QUIZ_ID,
      expect.any(String),
      longestName
    );
  });
});

describe('POST /api/player/answer', () => {
  const answer = (value: string) =>
    submitAnswer(
      post('/api/player/answer', {
        quizId: QUIZ_ID,
        playerId: PLAYER_ID,
        questionId: 'question-1',
        answer: value,
      })
    );

  it('rejects an answer over the cap with 400', async () => {
    const response = await answer('a'.repeat(PLAYER_ANSWER_MAX_LENGTH + 1));

    expect(response.status).toBe(400);
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
    expect(mocks.broadcastAnswerAck).not.toHaveBeenCalled();
  });

  it('submits an answer at the cap', async () => {
    const longest = 'a'.repeat(PLAYER_ANSWER_MAX_LENGTH);
    const response = await answer(longest);

    expect(response.status).toBe(200);
    expect(mocks.submitAnswer).toHaveBeenCalledWith(
      QUIZ_ID,
      PLAYER_ID,
      'question-1',
      longest
    );
  });
});
