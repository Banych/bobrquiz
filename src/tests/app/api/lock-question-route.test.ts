import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RoundSummaryDTO } from '@application/dtos/round-summary.dto';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  broadcastRoundSummary: vi.fn(),
}));

vi.mock('@application/services/factories', () => ({
  getServices: () => ({
    lockQuestionUseCase: { execute: mocks.execute },
  }),
}));

vi.mock('@infrastructure/realtime/broadcast-round-summary', () => ({
  broadcastRoundSummary: mocks.broadcastRoundSummary,
}));

import { POST as lockQuestion } from '@/app/api/quiz/[quizId]/lock-question/route';

const roundSummary: RoundSummaryDTO = {
  questionId: 'q1',
  questionText: 'What is 2 + 2?',
  correctAnswer: '4',
  questionIndex: 0,
  playerResults: [],
  averageTime: null,
  correctCount: 0,
  totalPlayers: 0,
  leaderboardDeltas: [],
  lockedAt: '2026-10-16T09:00:00.000Z',
};

const callRoute = () =>
  lockQuestion(new Request('http://localhost', { method: 'POST' }), {
    params: Promise.resolve({ quizId: 'quiz-1' }),
  });

describe('POST /api/quiz/[quizId]/lock-question', () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.broadcastRoundSummary.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the round summary and broadcasts it', async () => {
    mocks.execute.mockResolvedValue(roundSummary);
    mocks.broadcastRoundSummary.mockResolvedValue(undefined);

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(roundSummary);
    expect(mocks.execute).toHaveBeenCalledWith('quiz-1');
    expect(mocks.broadcastRoundSummary).toHaveBeenCalledWith(
      'quiz-1',
      roundSummary
    );
  });

  it('still returns the round summary when the broadcast fails', async () => {
    mocks.execute.mockResolvedValue(roundSummary);
    mocks.broadcastRoundSummary.mockRejectedValue(
      new Error('Channel subscribe TIMED_OUT')
    );

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(roundSummary);
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to broadcast round summary after lock',
      expect.objectContaining({ quizId: 'quiz-1' })
    );
  });

  it('maps an already locked question to 400', async () => {
    mocks.execute.mockRejectedValue(new Error('Question already locked'));

    const response = await callRoute();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Question already locked',
    });
    expect(mocks.broadcastRoundSummary).not.toHaveBeenCalled();
  });

  it('maps an inactive quiz to 404', async () => {
    mocks.execute.mockRejectedValue(
      new Error('Quiz is not active or does not exist.')
    );

    const response = await callRoute();

    expect(response.status).toBe(404);
  });
});
