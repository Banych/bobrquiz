import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QuizDTO } from '@application/dtos/quiz.dto';

const sendMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();

vi.mock('@infrastructure/realtime/broadcast-channel-pool', () => ({
  broadcastPool: { send: sendMock },
}));

vi.mock('@infrastructure/realtime/supabase-server-client', () => ({
  getSupabaseServerClient: () => getSupabaseServerClientMock(),
}));

const buildQuiz = (): QuizDTO => ({
  id: 'quiz-1',
  title: 'Test Quiz',
  status: 'Active',
  currentQuestionIndex: 0,
  settings: { timePerQuestion: 30, allowSkipping: false },
  questions: [
    {
      id: 'q1',
      text: 'Active question?',
      options: ['A', 'B'],
      type: 'multiple-choice',
      points: 100,
      orderIndex: 0,
      answersLockedAt: null,
    },
    {
      id: 'q2',
      text: 'Future question?',
      options: ['C', 'D'],
      type: 'multiple-choice',
      points: 100,
      orderIndex: 1,
      answersLockedAt: null,
    },
  ],
  players: [{ id: 'p1', name: 'Alice', status: 'Active', score: 0 }],
  answers: {
    p1: [
      {
        playerId: 'p1',
        questionId: 'q1',
        value: 'A',
        timestamp: '2026-07-03T10:00:00.000Z',
        isCorrect: true,
      },
    ],
  },
  leaderboard: [],
  activeQuestionId: 'q1',
  startTime: null,
  endTime: null,
  joinCode: 'ABCD',
  timer: {
    duration: 30,
    remainingSeconds: null,
    startTime: null,
    endTime: null,
  },
});

describe('broadcastQuizState', () => {
  beforeEach(() => {
    sendMock.mockClear();
    getSupabaseServerClientMock.mockReset();
  });

  it('does nothing when no Supabase client is configured', async () => {
    getSupabaseServerClientMock.mockReturnValue(null);
    const { broadcastQuizState } =
      await import('@infrastructure/realtime/broadcast-quiz-state');

    await broadcastQuizState('quiz-1', buildQuiz());

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends full state on state:update and redacted state on state:update:player', async () => {
    const fakeClient = {};
    getSupabaseServerClientMock.mockReturnValue(fakeClient);
    const { broadcastQuizState } =
      await import('@infrastructure/realtime/broadcast-quiz-state');
    const quiz = buildQuiz();

    await broadcastQuizState('quiz-1', quiz);

    expect(sendMock).toHaveBeenCalledTimes(2);

    const [fullCall, playerCall] = sendMock.mock.calls;
    expect(fullCall).toEqual([fakeClient, 'quiz:quiz-1', 'state:update', quiz]);

    expect(playerCall?.[0]).toBe(fakeClient);
    expect(playerCall?.[1]).toBe('quiz:quiz-1');
    expect(playerCall?.[2]).toBe('state:update:player');

    const playerPayload = playerCall?.[3] as QuizDTO;
    expect(playerPayload.answers).toBeUndefined();
    expect(playerPayload.questions.find((q) => q.id === 'q1')?.text).toBe(
      'Active question?'
    );
    expect(playerPayload.questions.find((q) => q.id === 'q2')?.text).toBe('');
  });
});
