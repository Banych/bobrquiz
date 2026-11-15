/**
 * Length caps on what a player sends (issue 157). Kept free of zod so the
 * player's join form and answer field can import them without pulling the
 * schemas into the browser bundle; `player.dto.ts` builds the schemas.
 */

/**
 * Longest player name. Anyone with a join code can add a player, and the name
 * goes to every player on every session poll.
 */
export const PLAYER_NAME_MAX_LENGTH = 40;

/**
 * Longest submitted answer. Equal to `MAX_QUESTION_ANSWER_LENGTH`, the cap on
 * a question's correct answers, so a longer answer could never score;
 * `player.dto.test.ts` checks the two stay equal.
 */
export const PLAYER_ANSWER_MAX_LENGTH = 200;
