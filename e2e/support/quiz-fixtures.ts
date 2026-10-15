import {
  test as base,
  request,
  type APIRequestContext,
} from '@playwright/test';

export const BASE_URL = 'http://localhost:3000';
export const ADMIN_STORAGE_STATE = 'playwright/.auth/user.json';
export const FIXTURE_TITLE_PREFIX = 'E2E fixture ';
export const STALE_FIXTURE_AGE_MS = 30 * 60_000;

export type QuestionSeed = {
  text: string;
  type: 'multiple-choice' | 'text' | 'true/false';
  options?: string[];
  correctAnswers: string[];
  points?: number;
};

export const QUESTIONS = {
  capitalOfFrance: {
    text: 'What is the capital of France?',
    type: 'multiple-choice',
    options: ['Paris', 'London', 'Berlin', 'Rome'],
    correctAnswers: ['Paris'],
  },
  largestPlanet: {
    text: 'Which planet is the largest in the solar system?',
    type: 'multiple-choice',
    options: ['Mercury', 'Venus', 'Jupiter', 'Mars'],
    correctAnswers: ['Jupiter'],
  },
  freeText: {
    text: 'Name the largest ocean on Earth.',
    type: 'text',
    correctAnswers: ['pacific'],
  },
  trueFalse: {
    text: 'True or false: water boils at 100°C at sea level.',
    type: 'true/false',
    correctAnswers: ['True'],
  },
} satisfies Record<string, QuestionSeed>;

export type CreateQuizOptions = {
  /** short name of the spec, part of the title */
  label: string;
  /** added in this order; may be empty */
  questions: QuestionSeed[];
  /** start the quiz (Pending → Active) after adding the questions */
  start?: boolean;
};

export type TestQuiz = { id: string; joinCode: string; title: string };

export function createAdminApi(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE_URL,
    storageState: ADMIN_STORAGE_STATE,
  });
}

type CallResult = { status: number; body: string };

async function call(
  api: APIRequestContext,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  data?: unknown,
  acceptStatuses: number[] = []
): Promise<CallResult> {
  const response = await api.fetch(path, {
    method,
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.text();
  const status = response.status();
  if (!response.ok() && !acceptStatuses.includes(status)) {
    throw new Error(`${method} ${path} failed: ${status} ${body}`);
  }
  return { status, body };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

export async function createTestQuiz(
  api: APIRequestContext,
  options: CreateQuizOptions
): Promise<TestQuiz> {
  const title = `${FIXTURE_TITLE_PREFIX}${options.label} ${Date.now()}-${randomSuffix()}`;
  const created = await call(api, 'POST', '/api/admin/quizzes', {
    title,
    timePerQuestion: 30,
  });
  const { id } = JSON.parse(created.body) as { id: string };

  try {
    for (const question of options.questions) {
      await call(api, 'POST', `/api/admin/quizzes/${id}/questions`, question);
    }
    const state = await call(api, 'GET', `/api/admin/quizzes/${id}`);
    const { joinCode } = JSON.parse(state.body) as { joinCode?: string | null };
    if (!joinCode) {
      throw new Error(`GET /api/admin/quizzes/${id} returned no joinCode`);
    }
    if (options.start) {
      await call(api, 'POST', '/api/quiz/start', { quizId: id });
    }
    return { id, joinCode, title };
  } catch (error) {
    await deleteTestQuiz(api, id).catch((cleanupError: unknown) => {
      console.warn(
        `[FIXTURE] cleanup of quiz ${id} failed: ${
          cleanupError instanceof Error ? cleanupError.message : cleanupError
        }`
      );
    });
    throw error;
  }
}

export async function deleteTestQuiz(
  api: APIRequestContext,
  quizId: string
): Promise<void> {
  const path = `/api/admin/quizzes/${quizId}`;
  const state = await call(api, 'GET', path, undefined, [404]);
  if (state.status === 404) return;
  const { status } = JSON.parse(state.body) as { status?: string };
  if (status === 'Active') {
    const reset = await call(api, 'POST', `${path}/reset`, undefined, [404]);
    if (reset.status === 404) return;
  }
  await call(api, 'DELETE', path, undefined, [404]);
}

export function fixtureTimestamp(title: string): number | null {
  const match = /\s(\d+)(?:-[^\s]+)?$/.exec(title);
  return match ? Number(match[1]) : null;
}

export async function sweepFixtureQuizzes(
  api: APIRequestContext,
  options: { titlePrefix?: string; olderThanMs?: number } = {}
): Promise<number> {
  const titlePrefix = options.titlePrefix ?? FIXTURE_TITLE_PREFIX;
  const olderThanMs = options.olderThanMs ?? STALE_FIXTURE_AGE_MS;
  const list = await call(api, 'GET', '/api/admin/quizzes');
  const quizzes = JSON.parse(list.body) as { id: string; title: string }[];
  const cutoff = Date.now() - olderThanMs;

  let deleted = 0;
  for (const quiz of quizzes) {
    if (!quiz.title.startsWith(titlePrefix)) continue;
    const createdAt = fixtureTimestamp(quiz.title);
    if (createdAt === null || createdAt >= cutoff) continue;
    await deleteTestQuiz(api, quiz.id);
    deleted += 1;
  }
  return deleted;
}

export const test = base.extend<
  { createQuiz: (options: CreateQuizOptions) => Promise<TestQuiz> },
  { adminApi: APIRequestContext }
>({
  adminApi: [
    async ({}, provide) => {
      const api = await createAdminApi();
      await provide(api);
      await api.dispose();
    },
    { scope: 'worker' },
  ],
  createQuiz: async ({ adminApi }, provide) => {
    const created: TestQuiz[] = [];
    await provide(async (options) => {
      const quiz = await createTestQuiz(adminApi, options);
      created.push(quiz);
      return quiz;
    });
    const errors: unknown[] = [];
    for (const quiz of created) {
      try {
        await deleteTestQuiz(adminApi, quiz.id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `fixture teardown failed for ${errors.length} quiz(zes): ${errors
          .map((error) => (error instanceof Error ? error.message : error))
          .join('; ')}`
      );
    }
  },
});

export { expect } from '@playwright/test';
