import { randomUUID } from 'node:crypto';
import { prisma } from '@infrastructure/database/prisma/client';
import type {
  Player,
  Prisma,
  Question,
  Quiz,
  QuestionType,
} from '@infrastructure/database/prisma/generated-client';

export type SeedQuizOptions = {
  title?: string;
  joinCode?: string;
  questionCount?: number;
  playerNames?: string[];
  publishQuestions?: boolean;
};

export type SeedQuizResult = {
  quiz: Quiz;
  questions: Question[];
  players: Player[];
};

type SeedQuestionInput = Prisma.QuestionCreateManyInput & {
  id: string;
  correctAnswers: string[];
};

type SeedPlayerInput = Prisma.PlayerCreateManyInput & {
  id: string;
};

const QUESTION_TEMPLATES: Array<{
  text: string;
  type: QuestionType;
  options?: string[];
  correctAnswers: string[];
  points?: number;
}> = [
  {
    text: 'What is the capital of France?',
    type: 'multiple_choice',
    options: ['Paris', 'London', 'Berlin', 'Rome'],
    correctAnswers: ['Paris'],
    points: 100,
  },
  {
    text: 'React hooks were introduced in which version?',
    type: 'multiple_choice',
    options: ['15.0', '16.8', '17.0', '18.0'],
    correctAnswers: ['16.8'],
    points: 150,
  },
  {
    text: 'True or false: Prisma supports PostgreSQL.',
    type: 'true_false',
    options: ['true', 'false'],
    correctAnswers: ['true'],
    points: 75,
  },
  {
    text: 'Briefly describe what DTO stands for.',
    type: 'text',
    correctAnswers: ['Data Transfer Object'],
    points: 50,
  },
];

export const resetDatabase = async () => {
  await prisma.$transaction([
    prisma.answer.deleteMany(),
    prisma.player.deleteMany(),
    prisma.question.deleteMany(),
    prisma.quiz.deleteMany(),
  ]);
};

export const seedSampleQuiz = async (
  options: SeedQuizOptions = {}
): Promise<SeedQuizResult> => {
  // Use fixed join code for E2E test compatibility (can be overridden via options)
  const joinCode =
    options.joinCode ?? process.env.TEST_JOIN_CODE ?? 'JOIN-KYTX';

  const quiz = await prisma.quiz.create({
    data: {
      title: options.title ?? 'Trivia Night Demo',
      status: 'Pending',
      timePerQuestion: 30,
      allowSkipping: true,
      joinCode,
    },
  });

  const questionCount = options.questionCount ?? QUESTION_TEMPLATES.length;
  const publishQuestions = options.publishQuestions ?? true;

  const questionInputs: SeedQuestionInput[] = Array.from({
    length: questionCount,
  }).map((_, index) => {
    const template = QUESTION_TEMPLATES[index % QUESTION_TEMPLATES.length];

    return {
      id: randomUUID(),
      quizId: quiz.id,
      text: template.text,
      options: template.options ?? [],
      correctAnswers: template.correctAnswers,
      type: template.type,
      points: template.points ?? 100,
      orderIndex: index,
      isPublished: publishQuestions,
    } satisfies SeedQuestionInput;
  });

  if (questionInputs.length) {
    await prisma.question.createMany({ data: questionInputs });
  }

  const playerNames = options.playerNames ?? ['Alex', 'Jamie'];
  const playerInputs: SeedPlayerInput[] = playerNames.map((name, index) => ({
    id: randomUUID(),
    quizId: quiz.id,
    name,
    status: 'Active',
    score: 100 * (playerNames.length - index),
    rank: index + 1,
  }));

  if (playerInputs.length) {
    await prisma.player.createMany({ data: playerInputs });
  }

  const now = new Date();
  const firstQuestion = questionInputs[0];
  const firstAnswerValue = firstQuestion?.correctAnswers?.[0] ?? 'N/A';
  const answerInputs: Prisma.AnswerCreateManyInput[] = playerInputs.flatMap(
    (player) => {
      if (!firstQuestion) {
        return [];
      }

      return [
        {
          id: randomUUID(),
          quizId: quiz.id,
          playerId: player.id,
          questionId: firstQuestion.id,
          value: firstAnswerValue,
          submittedAt: now,
          isCorrect: true,
          points: firstQuestion.points,
          timeTakenMs: 2500,
        },
      ];
    }
  );

  if (answerInputs.length) {
    await prisma.answer.createMany({ data: answerInputs });
  }

  const [questions, players] = await Promise.all([
    prisma.question.findMany({
      where: { quizId: quiz.id },
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.player.findMany({
      where: { quizId: quiz.id },
      orderBy: { connectedAt: 'asc' },
    }),
  ]);

  return { quiz, questions, players };
};

export const seedDemoQuiz = async () => seedSampleQuiz();

const LAUNCH_DEMO_JOIN_CODE = 'TRYBOBR';

const LAUNCH_DEMO_QUESTIONS: Array<{
  text: string;
  type: QuestionType;
  options?: string[];
  correctAnswers: string[];
  points: number;
}> = [
  {
    text: 'What is the largest planet in our solar system?',
    type: 'multiple_choice',
    options: ['Mercury', 'Venus', 'Jupiter', 'Saturn'],
    correctAnswers: ['Jupiter'],
    points: 100,
  },
  {
    text: 'True or false: Mount Everest is the tallest mountain on Earth.',
    type: 'true_false',
    options: ['true', 'false'],
    correctAnswers: ['true'],
    points: 100,
  },
  {
    text: 'Which ocean is the largest?',
    type: 'multiple_choice',
    options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'],
    correctAnswers: ['Pacific'],
    points: 100,
  },
  {
    text: 'How many continents are there?',
    type: 'multiple_choice',
    options: ['5', '6', '7', '8'],
    correctAnswers: ['7'],
    points: 100,
  },
  {
    text: 'True or false: A group of crows is called a murder.',
    type: 'true_false',
    options: ['true', 'false'],
    correctAnswers: ['true'],
    points: 100,
  },
];

/**
 * Additive, idempotent seed for a production-safe demo quiz. Unlike
 * `seedSampleQuiz`/`seedDemoQuiz` (dev/E2E fixtures that assume a clean
 * database), this never calls `resetDatabase()` and is safe to re-run
 * against a live database — it upserts on the quiz's unique `joinCode` and
 * only creates questions the first time.
 */
export const seedLaunchDemoQuiz = async (): Promise<SeedQuizResult> => {
  const quiz = await prisma.quiz.upsert({
    where: { joinCode: LAUNCH_DEMO_JOIN_CODE },
    update: {},
    create: {
      title: 'Bobr Quiz Demo',
      status: 'Pending',
      timePerQuestion: 20,
      allowSkipping: true,
      joinCode: LAUNCH_DEMO_JOIN_CODE,
    },
  });

  const existingQuestions = await prisma.question.findMany({
    where: { quizId: quiz.id },
    orderBy: { orderIndex: 'asc' },
  });

  if (existingQuestions.length > 0) {
    return { quiz, questions: existingQuestions, players: [] };
  }

  const questionInputs: SeedQuestionInput[] = LAUNCH_DEMO_QUESTIONS.map(
    (template, index) => ({
      id: randomUUID(),
      quizId: quiz.id,
      text: template.text,
      options: template.options ?? [],
      correctAnswers: template.correctAnswers,
      type: template.type,
      points: template.points,
      orderIndex: index,
      isPublished: true,
    })
  );

  await prisma.question.createMany({ data: questionInputs });

  const questions = await prisma.question.findMany({
    where: { quizId: quiz.id },
    orderBy: { orderIndex: 'asc' },
  });

  return { quiz, questions, players: [] };
};
