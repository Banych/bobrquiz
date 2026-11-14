/**
 * How much one host may create. With sign-ups open any confirmed account can
 * use the admin API, so these keep a single scripted account from filling the
 * shared database (issue 167). The media caps are in `media-file.ts`.
 */

/** Most quizzes one host may own. */
export const MAX_QUIZZES_PER_OWNER = 100;

/** Most questions one quiz may hold. */
export const MAX_QUESTIONS_PER_QUIZ = 100;

/** Start of every cap message; the API routes map it to a 400. */
export const LIMIT_REACHED_PREFIX = 'Limit reached:';
