import { z } from 'zod';

/**
 * Length caps on input arrays. Every input array needs one: zod reports one
 * issue per bad element of an uncapped array, so a large request body can
 * exhaust memory; with a cap, zod 4.6.6+ stops at the length check
 * (Dependabot alert 187, issue 152). The UI has no limit of its own; these sit
 * far above any real question.
 */
export const MAX_QUESTION_OPTIONS = 50;
export const MAX_QUESTION_CORRECT_ANSWERS = 50;
export const MAX_REORDER_QUESTIONS = 500;

/**
 * DTO for creating a new question (admin)
 */
export const CreateQuestionDTO = z.object({
  quizId: z.string().min(1, 'Quiz ID is required'),
  text: z.string().min(1, 'Question text is required').max(1000),
  type: z.enum(['multiple-choice', 'text', 'true/false']),
  options: z.array(z.string()).max(MAX_QUESTION_OPTIONS).default([]),
  correctAnswers: z
    .array(z.string().min(1))
    .min(1, 'At least one correct answer is required')
    .max(MAX_QUESTION_CORRECT_ANSWERS),
  points: z.number().int().positive().default(10),
  mediaUrl: z.string().url().nullable().optional(),
  mediaType: z.enum(['image', 'video', 'audio']).nullable().optional(),
});

export type CreateQuestionDTO = z.infer<typeof CreateQuestionDTO>;

/**
 * The create request's body: the quiz id comes from the route. Parse the raw
 * body with this, never spread it into an object first: spreading a JSON
 * string body makes one key per character before zod sees it.
 */
export const CreateQuestionBodyDTO = CreateQuestionDTO.omit({ quizId: true });

/**
 * DTO for updating an existing question (admin)
 */
export const UpdateQuestionDTO = z.object({
  text: z.string().min(1).max(1000).optional(),
  type: z.enum(['multiple-choice', 'text', 'true/false']).optional(),
  options: z.array(z.string()).max(MAX_QUESTION_OPTIONS).optional(),
  correctAnswers: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_QUESTION_CORRECT_ANSWERS)
    .optional(),
  points: z.number().int().positive().optional(),
  mediaUrl: z.string().url().nullable().optional(),
  mediaType: z.enum(['image', 'video', 'audio']).nullable().optional(),
});

export type UpdateQuestionDTO = z.infer<typeof UpdateQuestionDTO>;

/**
 * DTO for question detail (admin) - includes correctAnswers
 * ⚠️ Admin-only: Never expose to players (use QuestionDTO for player-facing)
 */
export const QuestionAdminDTO = z.object({
  id: z.string(),
  quizId: z.string(),
  text: z.string(),
  type: z.enum(['multiple-choice', 'text', 'true/false']),
  options: z.array(z.string()),
  correctAnswers: z.array(z.string()), // ⚠️ Admin-only field
  points: z.number().int().nonnegative(),
  orderIndex: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  mediaUrl: z.string().url().nullable().optional(),
  mediaType: z.enum(['image', 'video', 'audio']).nullable().optional(),
});

export type QuestionAdminDTO = z.infer<typeof QuestionAdminDTO>;

/**
 * DTO for question list item (admin dashboard)
 * Lightweight version for table views
 */
export const QuestionListItemDTO = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['multiple-choice', 'text', 'true/false']),
  points: z.number().int().nonnegative(),
  orderIndex: z.number().int().nonnegative(),
  hasCorrectAnswers: z.boolean(), // Validation indicator
  mediaUrl: z.string().url().nullable().optional(),
  quizId: z.string().optional(),
  quizTitle: z.string().optional(),
});

export type QuestionListItemDTO = z.infer<typeof QuestionListItemDTO>;

/**
 * DTO for reordering questions (drag-drop)
 */
export const ReorderQuestionsDTO = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        orderIndex: z.number().int().nonnegative(),
      })
    )
    .max(MAX_REORDER_QUESTIONS),
});

export type ReorderQuestionsDTO = z.infer<typeof ReorderQuestionsDTO>;
