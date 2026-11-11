import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactElement } from 'react';

const mocks = vi.hoisted(() => ({
  quizService: {
    listQuizzesByOwner: vi.fn(),
    assertQuizOwner: vi.fn(),
    getQuizState: vi.fn(),
  },
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock('@application/services/factories', () => ({
  getServices: () => ({ quizService: mocks.quizService }),
}));
vi.mock('@infrastructure/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
// The pages only hand data to these client components; their behaviour is not under test
vi.mock('@/components/host/host-quiz-dashboard', () => ({
  HostQuizDashboard: () => null,
}));
vi.mock('@/components/host/live-game-screen', () => ({
  LiveGameScreen: () => null,
}));

import HostPage from '@/app/(host)/host/page';
import HostQuizPage from '@/app/(host)/quiz/[quizId]/page';
import LivePage from '@/app/(host)/quiz/[quizId]/live/page';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';

const HOST_A = 'host-a';
const HOST_B = 'host-b';
const A_QUIZ = 'quiz-a';
const quizState = { id: A_QUIZ, title: 'A quiz' };

const quizPages = [
  { name: 'dashboard', render: HostQuizPage, dataProp: 'initialQuiz' },
  { name: 'live', render: LivePage, dataProp: 'initialData' },
] as const;

const props = () => ({ params: Promise.resolve({ quizId: A_QUIZ }) });

describe('Host pages ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.quizService.assertQuizOwner.mockImplementation(
      async (quizId: string, ownerId: string) => {
        if (quizId !== A_QUIZ || ownerId !== HOST_A) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
      }
    );
    mocks.quizService.getQuizState.mockResolvedValue(quizState);
    mocks.quizService.listQuizzesByOwner.mockResolvedValue([]);
    vi.mocked(getCurrentUserId).mockResolvedValue(HOST_A);
  });

  describe('/host', () => {
    it("lists only the signed-in user's quizzes", async () => {
      await HostPage();

      expect(mocks.quizService.listQuizzesByOwner).toHaveBeenCalledWith(HOST_A);
    });

    it('sends a signed-out visitor to login', async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);

      await expect(HostPage()).rejects.toThrow(
        'NEXT_REDIRECT /login?redirect=%2Fhost'
      );
      expect(mocks.quizService.listQuizzesByOwner).not.toHaveBeenCalled();
    });
  });

  describe.each(quizPages)('/quiz/[quizId] $name', ({ render, dataProp }) => {
    it('renders the quiz for its owner after the owner check', async () => {
      const element = (await render(props())) as ReactElement<
        Record<string, unknown>
      >;

      expect(element.props.quizId).toBe(A_QUIZ);
      expect(element.props[dataProp]).toEqual(quizState);
      expect(mocks.quizService.assertQuizOwner).toHaveBeenCalledWith(
        A_QUIZ,
        HOST_A
      );
      expect(
        mocks.quizService.assertQuizOwner.mock.invocationCallOrder[0]
      ).toBeLessThan(
        mocks.quizService.getQuizState.mock.invocationCallOrder[0]
      );
    });

    it("shows not-found for another host's quiz without loading it", async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue(HOST_B);

      await expect(render(props())).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mocks.notFound).toHaveBeenCalled();
      expect(mocks.quizService.getQuizState).not.toHaveBeenCalled();
    });

    it('shows not-found with no session without checking the owner', async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null);

      await expect(render(props())).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mocks.quizService.assertQuizOwner).not.toHaveBeenCalled();
      expect(mocks.quizService.getQuizState).not.toHaveBeenCalled();
    });
  });
});
