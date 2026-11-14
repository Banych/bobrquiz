import {
  CreateQuestionDTO,
  MAX_QUESTION_ANSWER_LENGTH,
  MAX_QUESTION_CORRECT_ANSWERS,
  MAX_QUESTION_OPTIONS,
  MAX_REORDER_QUESTIONS,
  ReorderQuestionsDTO,
  UpdateQuestionDTO,
} from '@application/dtos/question-admin.dto';
import { describe, expect, it } from 'vitest';

// Oversized arrays of wrong-typed elements: before zod 4.6.6, and on any
// array without a length cap, zod reports one issue per bad element, which
// lets a request body exhaust memory (Dependabot alert 187, issue 152).
const badElements = (count: number) => Array.from({ length: count }, () => 0);

const validCreate = {
  quizId: 'quiz-1',
  text: 'Question?',
  type: 'multiple-choice' as const,
  options: ['A', 'B'],
  correctAnswers: ['A'],
};

const expectSingleTooBig = (result: {
  success: boolean;
  error?: { issues: { code: string; path: PropertyKey[] }[] };
}) => {
  expect(result.success).toBe(false);
  expect(result.error?.issues).toHaveLength(1);
  expect(result.error?.issues[0].code).toBe('too_big');
};

describe('question-admin DTO array caps', () => {
  describe('CreateQuestionDTO', () => {
    it('accepts options and correctAnswers at the cap', () => {
      const options = Array.from(
        { length: MAX_QUESTION_OPTIONS },
        (_, i) => `O${i}`
      );
      const correctAnswers = options.slice(0, MAX_QUESTION_CORRECT_ANSWERS);

      const result = CreateQuestionDTO.safeParse({
        ...validCreate,
        options,
        correctAnswers,
      });

      expect(result.success).toBe(true);
    });

    it('rejects oversized options with a single issue', () => {
      const result = CreateQuestionDTO.safeParse({
        ...validCreate,
        options: badElements(MAX_QUESTION_OPTIONS + 1000),
      });

      expectSingleTooBig(result);
      expect(result.error?.issues[0].path).toEqual(['options']);
    });

    it('rejects oversized correctAnswers with a single issue', () => {
      const result = CreateQuestionDTO.safeParse({
        ...validCreate,
        correctAnswers: badElements(MAX_QUESTION_CORRECT_ANSWERS + 1000),
      });

      expectSingleTooBig(result);
      expect(result.error?.issues[0].path).toEqual(['correctAnswers']);
    });
  });

  describe('UpdateQuestionDTO', () => {
    it('rejects oversized options with a single issue', () => {
      const result = UpdateQuestionDTO.safeParse({
        options: badElements(MAX_QUESTION_OPTIONS + 1000),
      });

      expectSingleTooBig(result);
      expect(result.error?.issues[0].path).toEqual(['options']);
    });

    it('rejects oversized correctAnswers with a single issue', () => {
      const result = UpdateQuestionDTO.safeParse({
        correctAnswers: badElements(MAX_QUESTION_CORRECT_ANSWERS + 1000),
      });

      expectSingleTooBig(result);
      expect(result.error?.issues[0].path).toEqual(['correctAnswers']);
    });
  });

  describe('option and answer length (issue 167)', () => {
    const atCap = 'x'.repeat(MAX_QUESTION_ANSWER_LENGTH);
    const pastCap = 'x'.repeat(MAX_QUESTION_ANSWER_LENGTH + 1);

    it('accepts options and correctAnswers at the length cap', () => {
      const body = { options: [atCap, 'B'], correctAnswers: [atCap] };

      expect(
        CreateQuestionDTO.safeParse({ ...validCreate, ...body }).success
      ).toBe(true);
      expect(UpdateQuestionDTO.safeParse(body).success).toBe(true);
    });

    it.each([
      ['options', { options: [pastCap, 'B'] }],
      ['correctAnswers', { correctAnswers: [pastCap] }],
    ] as const)('rejects a too-long element of %s', (field, body) => {
      for (const result of [
        CreateQuestionDTO.safeParse({ ...validCreate, ...body }),
        UpdateQuestionDTO.safeParse(body),
      ]) {
        expectSingleTooBig(result);
        expect(result.error?.issues[0].path).toEqual([field, 0]);
      }
    });
  });

  describe('ReorderQuestionsDTO', () => {
    it('accepts questions at the cap', () => {
      const questions = Array.from(
        { length: MAX_REORDER_QUESTIONS },
        (_, i) => ({ id: `q${i}`, orderIndex: i })
      );

      expect(ReorderQuestionsDTO.safeParse({ questions }).success).toBe(true);
    });

    it('rejects oversized questions with a single issue', () => {
      const result = ReorderQuestionsDTO.safeParse({
        questions: badElements(MAX_REORDER_QUESTIONS + 1000),
      });

      expectSingleTooBig(result);
      expect(result.error?.issues[0].path).toEqual(['questions']);
    });
  });
});
