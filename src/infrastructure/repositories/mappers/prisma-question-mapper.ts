import { Question } from '@domain/entities/question';
import type {
  Prisma,
  Question as PrismaQuestion,
  QuestionType,
} from '@infrastructure/database/prisma/generated-client';

const QUESTION_TYPE_TO_DOMAIN: Record<QuestionType, Question['type']> = {
  multiple_choice: 'multiple-choice',
  text: 'text',
  true_false: 'true/false',
};

const QUESTION_TYPE_TO_PRISMA: Record<Question['type'], QuestionType> = {
  'multiple-choice': 'multiple_choice',
  text: 'text',
  'true/false': 'true_false',
};

export const mapPrismaQuestionToDomain = (record: PrismaQuestion): Question => {
  const question = new Question(
    record.id,
    record.text,
    record.correctAnswers,
    QUESTION_TYPE_TO_DOMAIN[record.type],
    record.points,
    record.mediaUrl ?? undefined,
    record.mediaType ?? undefined,
    record.options.length ? record.options : undefined
  );

  question.quizId = record.quizId ?? undefined;
  question.orderIndex = record.orderIndex;
  question.isPublished = record.isPublished;
  question.answersLockedAt = record.answersLockedAt ?? undefined;
  question.createdAt = record.createdAt;
  question.updatedAt = record.updatedAt;

  return question;
};

export const mapQuestionToPrismaCreateInput = (
  question: Question
): Prisma.QuestionUncheckedCreateInput => {
  if (!question.quizId) {
    throw new Error('Question quizId is required to persist the record.');
  }

  return {
    id: question.id,
    quizId: question.quizId,
    text: question.text,
    mediaUrl: question.media ?? null,
    mediaType: question.mediaType ?? null,
    options: question.options ?? [],
    correctAnswers: question.correctAnswers,
    type: QUESTION_TYPE_TO_PRISMA[question.type],
    points: question.points,
    orderIndex: question.orderIndex ?? 0,
    isPublished: question.isPublished ?? false,
  };
};

export const mapQuestionToPrismaUpdateInput = (
  question: Question
): Prisma.QuestionUncheckedUpdateInput => {
  return {
    text: question.text,
    mediaUrl: question.media ?? null,
    mediaType: question.mediaType ?? null,
    options: question.options ?? [],
    correctAnswers: question.correctAnswers,
    type: QUESTION_TYPE_TO_PRISMA[question.type],
    points: question.points,
  };
};
