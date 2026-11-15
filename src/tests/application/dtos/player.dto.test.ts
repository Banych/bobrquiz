import {
  PLAYER_ANSWER_MAX_LENGTH,
  PLAYER_NAME_MAX_LENGTH,
} from '@application/dtos/player-input-limits';
import {
  PlayerAnswerSchema,
  PlayerNameSchema,
} from '@application/dtos/player.dto';
import { MAX_QUESTION_ANSWER_LENGTH } from '@application/dtos/question-admin.dto';
import { describe, expect, it } from 'vitest';

describe('PlayerNameSchema', () => {
  it('accepts a name at the cap', () => {
    const name = 'a'.repeat(PLAYER_NAME_MAX_LENGTH);
    expect(PlayerNameSchema.parse(name)).toBe(name);
  });

  it('rejects a name one over the cap', () => {
    expect(
      PlayerNameSchema.safeParse('a'.repeat(PLAYER_NAME_MAX_LENGTH + 1)).success
    ).toBe(false);
  });

  it('trims before checking, so padding does not count toward the cap', () => {
    const name = 'a'.repeat(PLAYER_NAME_MAX_LENGTH);
    expect(PlayerNameSchema.parse(`  ${name}  `)).toBe(name);
  });

  it('rejects a blank name', () => {
    expect(PlayerNameSchema.safeParse('   ').success).toBe(false);
    expect(PlayerNameSchema.safeParse('').success).toBe(false);
  });
});

describe('PlayerAnswerSchema', () => {
  it('accepts an answer at the cap', () => {
    const answer = 'a'.repeat(PLAYER_ANSWER_MAX_LENGTH);
    expect(PlayerAnswerSchema.parse(answer)).toBe(answer);
  });

  it('rejects an answer one over the cap', () => {
    expect(
      PlayerAnswerSchema.safeParse('a'.repeat(PLAYER_ANSWER_MAX_LENGTH + 1))
        .success
    ).toBe(false);
  });

  it('rejects an empty answer', () => {
    expect(PlayerAnswerSchema.safeParse('').success).toBe(false);
  });

  it('caps answers at the same length as correct answers', () => {
    expect(PLAYER_ANSWER_MAX_LENGTH).toBe(MAX_QUESTION_ANSWER_LENGTH);
  });
});
