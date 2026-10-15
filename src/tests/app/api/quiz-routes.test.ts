import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    $disconnect: vi.fn(),
  },
}));

import { GET as getQuizState } from '@/app/api/quiz/[quizId]/state/route';
import { GET as getQuizPlayers } from '@/app/api/quiz/[quizId]/players/route';
import * as servicesModule from '@application/services/factories';

type MockQuizService = {
  getQuizState: ReturnType<typeof vi.fn>;
};

type MockPlayerService = {
  listPlayersForQuiz: ReturnType<typeof vi.fn>;
};

type ServiceContainer = ReturnType<typeof servicesModule.getServices>;

describe('Quiz API routes', () => {
  let quizService: MockQuizService;
  let playerService: MockPlayerService;

  beforeEach(() => {
    quizService = {
      getQuizState: vi.fn(),
    };

    playerService = {
      listPlayersForQuiz: vi.fn(),
    };

    vi.spyOn(servicesModule, 'getServices').mockReturnValue({
      quizService: quizService as unknown as ServiceContainer['quizService'],
      playerService:
        playerService as unknown as ServiceContainer['playerService'],
      answerService: {} as ServiceContainer['answerService'],
      joinSessionUseCase: {} as ServiceContainer['joinSessionUseCase'],
      questionService: {} as ServiceContainer['questionService'],
      auditService: {} as ServiceContainer['auditService'],
      lockQuestionUseCase: {} as ServiceContainer['lockQuestionUseCase'],
      getPlayerConnectionStatusUseCase:
        {} as ServiceContainer['getPlayerConnectionStatusUseCase'],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/quiz/[quizId]/state returns quiz state DTO', async () => {
    quizService.getQuizState.mockResolvedValue({
      id: 'quiz-1',
      title: 'Demo',
      status: 'Pending',
      questions: [],
      players: [],
      settings: { allowSkipping: true, timePerQuestion: 30 },
    });

    const response = await getQuizState(new Request('http://localhost'), {
      params: Promise.resolve({ quizId: 'quiz-1' }),
    });

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.id).toBe('quiz-1');
    expect(quizService.getQuizState).toHaveBeenCalledWith('quiz-1');
  });

  it('GET /api/quiz/[quizId]/state maps domain errors to HTTP status', async () => {
    quizService.getQuizState.mockRejectedValue(new Error('Quiz not found.'));

    const response = await getQuizState(new Request('http://localhost'), {
      params: Promise.resolve({ quizId: 'missing' }),
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toMatch(/not found/i);
  });

  it('GET /api/quiz/[quizId]/players returns player DTOs', async () => {
    playerService.listPlayersForQuiz.mockResolvedValue([
      { id: 'p1', name: 'Alex', status: 'Active' },
    ]);

    const response = await getQuizPlayers(new Request('http://localhost'), {
      params: Promise.resolve({ quizId: 'quiz-1' }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.players).toHaveLength(1);
    expect(payload.players[0].id).toBe('p1');
    expect(playerService.listPlayersForQuiz).toHaveBeenCalledWith('quiz-1');
  });

  it('GET /api/quiz/[quizId]/players handles errors', async () => {
    playerService.listPlayersForQuiz.mockRejectedValue(
      new Error('Quiz with ID missing not found.')
    );

    const response = await getQuizPlayers(new Request('http://localhost'), {
      params: Promise.resolve({ quizId: 'missing' }),
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toMatch(/not found/i);
  });
});
