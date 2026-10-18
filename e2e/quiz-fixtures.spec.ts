import {
  test,
  expect,
  QUESTIONS,
  FIXTURE_TITLE_PREFIX,
  createTestQuiz,
  deleteTestQuiz,
  fixtureTimestamp,
  sweepFixtureQuizzes,
} from './support/quiz-fixtures';

type AdminQuizState = {
  status: 'Pending' | 'Active' | 'Completed';
  joinCode?: string | null;
  questions?: { text: string }[];
};

type AdminQuizListItem = { id: string; title: string };

const uniqueLabel = (name: string) =>
  `${name}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('quiz fixtures', () => {
  test('creates a Pending quiz with its questions in order and a join code', async ({
    adminApi,
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'fixture-create',
      questions: [QUESTIONS.capitalOfFrance, QUESTIONS.freeText],
    });

    expect(
      quiz.title.startsWith(`${FIXTURE_TITLE_PREFIX}fixture-create `)
    ).toBe(true);
    expect(quiz.joinCode).toMatch(/^JOIN-[A-Z0-9]{4}$/);

    const response = await adminApi.get(`/api/admin/quizzes/${quiz.id}`);
    expect(response.ok()).toBe(true);
    const state = (await response.json()) as AdminQuizState;
    expect(state.status).toBe('Pending');
    expect(state.joinCode).toBe(quiz.joinCode);
    expect(state.questions?.map((question) => question.text)).toEqual([
      QUESTIONS.capitalOfFrance.text,
      QUESTIONS.freeText.text,
    ]);
  });

  test('starts the quiz when asked', async ({ adminApi, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'fixture-start',
      questions: [QUESTIONS.freeText],
      start: true,
    });

    const state = (await (
      await adminApi.get(`/api/admin/quizzes/${quiz.id}`)
    ).json()) as AdminQuizState;
    expect(state.status).toBe('Active');
  });

  test('titles are unique per call', async ({ createQuiz }) => {
    const first = await createQuiz({ label: 'fixture-same', questions: [] });
    const second = await createQuiz({ label: 'fixture-same', questions: [] });

    expect(first.title).not.toBe(second.title);
  });

  test('deletes an Active quiz', async ({ adminApi }) => {
    const quiz = await createTestQuiz(adminApi, {
      label: 'fixture-delete',
      questions: [QUESTIONS.capitalOfFrance],
      start: true,
    });

    await deleteTestQuiz(adminApi, quiz.id);

    const response = await adminApi.get(`/api/admin/quizzes/${quiz.id}`);
    expect(response.status()).toBe(404);
    // Deleting again is a no-op
    await deleteTestQuiz(adminApi, quiz.id);
  });

  test('a failed step throws with status and body, and removes the quiz', async ({
    adminApi,
  }) => {
    const label = uniqueLabel('fixture-error');

    await expect(
      createTestQuiz(adminApi, {
        label,
        questions: [{ text: 'No answers', type: 'text', correctAnswers: [] }],
      })
    ).rejects.toThrow(
      /POST \/api\/admin\/quizzes\/[^/]+\/questions failed: 400/
    );

    const list = (await (
      await adminApi.get('/api/admin/quizzes')
    ).json()) as AdminQuizListItem[];
    expect(
      list.filter((item) =>
        item.title.startsWith(`${FIXTURE_TITLE_PREFIX}${label}`)
      )
    ).toEqual([]);
  });

  test('reads the timestamp from a fixture title', () => {
    expect(fixtureTimestamp('E2E fixture host 1760000000000-ab12')).toBe(
      1760000000000
    );
    expect(fixtureTimestamp('E2E fixture admin-quiz-crud 1760000000000')).toBe(
      1760000000000
    );
    expect(fixtureTimestamp('E2E fixture host')).toBeNull();
    expect(fixtureTimestamp('E2E fixture host 1760000000000 extra')).toBeNull();
    // Only the shapes the fixtures write: 13 digits, optionally a 4-character suffix
    expect(fixtureTimestamp('E2E fixture round 2')).toBeNull();
    expect(fixtureTimestamp('E2E fixture demo 2024')).toBeNull();
    expect(fixtureTimestamp('E2E fixture x 5-bar')).toBeNull();
    expect(
      fixtureTimestamp('E2E fixture host 1760000000000-ab12cd')
    ).toBeNull();
  });

  test('sweep deletes stale prefixed quizzes and keeps fresh ones', async ({
    adminApi,
    createQuiz,
  }) => {
    const label = uniqueLabel('fixture-sweep');
    const staleAt = Date.now() - 31 * 60_000;
    // Created directly so its title carries a timestamp 31 minutes old; if the sweep fails to
    // delete it, the next run's cleanup project does
    const created = await adminApi.post('/api/admin/quizzes', {
      data: {
        title: `${FIXTURE_TITLE_PREFIX}${label} ${staleAt}-old1`,
        timePerQuestion: 30,
      },
    });
    expect(created.status()).toBe(201);
    const stale = (await created.json()) as { id: string };
    const fresh = await createQuiz({ label, questions: [] });

    const deleted = await sweepFixtureQuizzes(adminApi, {
      titlePrefix: `${FIXTURE_TITLE_PREFIX}${label}`,
    });

    expect(deleted).toBe(1);
    expect(
      (await adminApi.get(`/api/admin/quizzes/${stale.id}`)).status()
    ).toBe(404);
    expect((await adminApi.get(`/api/admin/quizzes/${fresh.id}`)).ok()).toBe(
      true
    );
  });

  test('sweep skips prefixed titles without a timestamp', async ({
    adminApi,
  }) => {
    const label = uniqueLabel('fixture-untimed');
    const created = await adminApi.post('/api/admin/quizzes', {
      data: {
        title: `${FIXTURE_TITLE_PREFIX}${label} no timestamp`,
        timePerQuestion: 30,
      },
    });
    expect(created.status()).toBe(201);
    const quiz = (await created.json()) as { id: string };

    try {
      const deleted = await sweepFixtureQuizzes(adminApi, {
        titlePrefix: `${FIXTURE_TITLE_PREFIX}${label}`,
        olderThanMs: 0,
      });

      expect(deleted).toBe(0);
      expect((await adminApi.get(`/api/admin/quizzes/${quiz.id}`)).ok()).toBe(
        true
      );
    } finally {
      await deleteTestQuiz(adminApi, quiz.id);
    }
  });
});
