import { describe, expect, it } from 'vitest';
import { mapQuizToPlayerFacingDTO } from '@application/mappers/player-quiz-mapper';
import type { QuizDTO } from '@application/dtos/quiz.dto';

const buildQuiz = (overrides: Partial<QuizDTO> = {}): QuizDTO => ({
  id: 'quiz-1',
  title: 'Test Quiz',
  status: 'Active',
  currentQuestionIndex: 1,
  settings: { timePerQuestion: 30, allowSkipping: false },
  questions: [
    {
      id: 'q1',
      text: 'Already asked question?',
      media: 'https://example.com/q1.png',
      mediaType: 'image',
      options: ['A', 'B'],
      type: 'multiple-choice',
      points: 100,
      orderIndex: 0,
      answersLockedAt: '2026-07-03T10:00:00.000Z',
    },
    {
      id: 'q2',
      text: 'Currently active question?',
      media: undefined,
      options: ['C', 'D'],
      type: 'multiple-choice',
      points: 100,
      orderIndex: 1,
      answersLockedAt: null,
    },
    {
      id: 'q3',
      text: 'Not yet asked question?',
      media: 'https://example.com/q3.png',
      mediaType: 'image',
      options: ['E', 'F'],
      type: 'multiple-choice',
      points: 100,
      orderIndex: 2,
      answersLockedAt: null,
    },
  ],
  players: [
    { id: 'p1', name: 'Alice', status: 'Active', score: 100, rank: 1 },
    { id: 'p2', name: 'Bob', status: 'Active', score: 50, rank: 2 },
  ],
  answers: {
    p1: [
      {
        playerId: 'p1',
        questionId: 'q2',
        value: 'C',
        timestamp: '2026-07-03T10:00:00.000Z',
        isCorrect: true,
        points: 100,
        timeTaken: 5,
      },
    ],
    p2: [
      {
        playerId: 'p2',
        questionId: 'q2',
        value: 'D',
        timestamp: '2026-07-03T10:00:01.000Z',
        isCorrect: false,
        points: 0,
        timeTaken: 8,
      },
    ],
  },
  leaderboard: [
    { playerId: 'p1', score: 100 },
    { playerId: 'p2', score: 50 },
  ],
  activeQuestionId: 'q2',
  startTime: '2026-07-03T09:59:00.000Z',
  endTime: null,
  joinCode: 'ABCD',
  timer: {
    duration: 30,
    remainingSeconds: 20,
    startTime: '2026-07-03T10:00:05.000Z',
    endTime: null,
  },
  ...overrides,
});

describe('player-quiz-mapper', () => {
  describe('mapQuizToPlayerFacingDTO', () => {
    it('keeps full content for the active question', () => {
      const result = mapQuizToPlayerFacingDTO(buildQuiz());

      const active = result.questions.find((q) => q.id === 'q2');
      expect(active).toEqual({
        id: 'q2',
        text: 'Currently active question?',
        media: undefined,
        mediaType: undefined,
        options: ['C', 'D'],
        type: 'multiple-choice',
        points: 100,
        orderIndex: 1,
        answersLockedAt: null,
      });
    });

    it('redacts text/media/options for non-active questions', () => {
      const result = mapQuizToPlayerFacingDTO(buildQuiz());

      const past = result.questions.find((q) => q.id === 'q1');
      const future = result.questions.find((q) => q.id === 'q3');

      for (const question of [past, future]) {
        expect(question).toBeDefined();
        expect(question?.text).toBe('');
        expect(question?.media).toBeUndefined();
        expect(question?.mediaType).toBeUndefined();
        expect(question?.options).toBeUndefined();
      }

      // Non-content fields are preserved
      expect(past).toMatchObject({
        id: 'q1',
        type: 'multiple-choice',
        points: 100,
        orderIndex: 0,
        answersLockedAt: '2026-07-03T10:00:00.000Z',
      });
      expect(future).toMatchObject({
        id: 'q3',
        type: 'multiple-choice',
        points: 100,
        orderIndex: 2,
        answersLockedAt: null,
      });
    });

    it('preserves questions.length (redacts, does not filter)', () => {
      const quiz = buildQuiz();
      const result = mapQuizToPlayerFacingDTO(quiz);

      expect(result.questions).toHaveLength(quiz.questions.length);
    });

    it('redacts every question when activeQuestionId is null', () => {
      const result = mapQuizToPlayerFacingDTO(
        buildQuiz({ activeQuestionId: null })
      );

      result.questions.forEach((question) => {
        expect(question.text).toBe('');
        expect(question.options).toBeUndefined();
      });
    });

    it('always omits answers regardless of input', () => {
      const result = mapQuizToPlayerFacingDTO(buildQuiz());

      expect(result.answers).toBeUndefined();
    });

    it('omits answers even when the input has none', () => {
      const result = mapQuizToPlayerFacingDTO(
        buildQuiz({ answers: undefined })
      );

      expect(result.answers).toBeUndefined();
    });

    it('passes through players, leaderboard, timer, settings, and status unchanged', () => {
      const quiz = buildQuiz();
      const result = mapQuizToPlayerFacingDTO(quiz);

      expect(result.players).toEqual(quiz.players);
      expect(result.leaderboard).toEqual(quiz.leaderboard);
      expect(result.timer).toEqual(quiz.timer);
      expect(result.settings).toEqual(quiz.settings);
      expect(result.status).toBe(quiz.status);
      expect(result.joinCode).toBe(quiz.joinCode);
      expect(result.activeQuestionId).toBe(quiz.activeQuestionId);
      expect(result.currentQuestionIndex).toBe(quiz.currentQuestionIndex);
      expect(result.startTime).toBe(quiz.startTime);
      expect(result.endTime).toBe(quiz.endTime);
      expect(result.id).toBe(quiz.id);
      expect(result.title).toBe(quiz.title);
    });
  });
});
