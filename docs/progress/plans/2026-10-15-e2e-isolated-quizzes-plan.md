# E2E isolated quizzes — implementation plan

**Status:** In progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every E2E test that needs a quiz gets its own, created through the admin API and deleted
afterwards, and the four tests behind the UI match it, so `yarn test:e2e` runs green twice in a row.

**Architecture:** one support module, `e2e/support/quiz-fixtures.ts`, wraps the admin API (create,
start, delete, sweep) and extends Playwright's `test` with a `createQuiz` fixture whose teardown
deletes what the test created. A `cleanup` Playwright project between `setup` and `chromium`
sweeps fixture quizzes older than 30 minutes. The specs move off the shared seeded quiz
(`quiz.setup.ts`, `fixtures.ts`), which are then deleted.

**Tech stack:** Playwright 1.64.1 (`@playwright/test`), Next.js 16 dev server on
`http://localhost:3000`, the admin session in `playwright/.auth/user.json` (from
`e2e/auth.setup.ts`).

**Spec:** `docs/progress/plans/2026-10-15-e2e-isolated-quizzes-design.md`

## Deviations from the spec (for the user's review)

1. **A fixture instead of explicit `beforeEach`/`afterEach` calls.** `test.extend` gives a
   test-scoped `createQuiz` (teardown deletes every quiz it made) and a worker-scoped `adminApi`.
   Same contract (one quiz per test, created through the admin API, deleted afterwards); tests that
   need no quiz create none.
2. **One app change:** `data-testid={`player-card-${player.playerId}`}` on the host player card
   (`src/components/host/player-list-with-status.tsx:79`). The connection-status test already looks
   for it; its fallback `getByText('Alice').locator('..')` resolves to the inner name row, which
   does not contain the "Last seen" line, so `/5s ago|just now/` can never match.
3. **More UI drift found while planning:** an Active quiz shows "Open Live View" and "Finish quiz";
   there is no "Resume quiz" button (`src/components/host/host-quiz-dashboard.tsx:166-178`), so
   host-dashboard test 2 asserts "Finish quiz".
4. **The sweep is its own Playwright project** (`setup` → `cleanup` → `chromium`), and a spec,
   `e2e/quiz-fixtures.spec.ts`, tests the helper itself (create, start, delete an Active quiz,
   sweep only what is old and prefixed, errors carry status and body).
5. **Quizzes the admin quiz spec creates through the UI get the fixture prefix**, so the sweep
   removes them instead of leaving them in the dev database.
6. **The sweep reads a quiz's age from its title, not from `createdAt`** (plan check,
   2026-10-15). `GET /api/admin/quizzes` returns the time of the request as every quiz's
   `createdAt` (`src/application/use-cases/list-all-quizzes.use-case.ts:22`), so the spec's
   "`createdAt` more than 30 minutes old" never matches. Fixture titles end in
   `<label> <Date.now()>-<suffix>`; the sweep parses that number and skips any prefixed title
   without one. The UI-created admin quiz titles (deviation 5) carry the same timestamp. The
   fake `createdAt` is a separate item, not fixed here.
7. **Small signature changes:** `createAdminApi()` takes no argument (`request.newContext` is
   imported from `@playwright/test`), and titles get a 4-character random suffix after the
   timestamp so two parallel calls in the same millisecond still differ.

## Global constraints

- One quiz per test; never share a quiz between tests or files.
- Fixture quiz titles start with exactly `E2E fixture ` (the sweep matches this prefix).
- The sweep deletes only prefixed quizzes whose title timestamp is more than 30 minutes old
  (deviation 6); a prefixed title without a parsable timestamp is left alone.
- `yarn lint` runs Prettier (`printWidth: 80`) and the React hooks rules on `e2e/` too: before
  the lint step, run `yarn eslint --fix <the files you touched>`, and never name a fixture
  callback's second parameter `use` or `useX` (the rules-of-hooks rule reports it; call it
  `provide`).
- Every admin API call checks the response and throws `<METHOD> <path> failed: <status> <body>`.
- App code changes: only the one `data-testid` (deviation 2). `yarn test:run` stays green.
- Run tests through `yarn test:e2e …`; the dev server must run from this worktree at
  `http://localhost:3000` (ask the user to start it; never start a second one).
- Never print values from `.env.local`.

## Review focus

1. **A test that fails or times out mid-way** must still have its quiz deleted, including an
   Active one (delete refuses Active; the helper resets first). Pinned by Task 1 test
   "deletes an Active quiz".
2. **A sweep running in another run or on the other machine** must not delete quizzes in use,
   and must delete the stale ones. Pinned by Task 1 tests "sweep deletes stale prefixed quizzes
   and keeps fresh ones" and "sweep skips prefixed titles without a timestamp". Two sweeps racing
   on the same quiz: a 404 from DELETE counts as already gone.
3. **A failed API call** (bad payload, expired admin session) must fail loudly with status and
   body, not continue with `undefined`, and must not leak a half-built quiz. Pinned by Task 1 test
   "a failed step throws and removes the quiz".
4. **Two tests in parallel with the same label** must get different titles (rows are found by
   title). Pinned by Task 1 test "titles are unique per call".
5. **The join rate limit** (10 joins per 60 s per IP) with retries. Not unit-testable; a
   refused join shows `Too many requests, please slow down.` in the page, never a status in
   Playwright's output, so Tasks 3 and 5 grep the saved run output and
   `test-results/**/error-context.md` for `Too many requests`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `e2e/support/quiz-fixtures.ts` | create | Admin API helpers, question presets, the `test`/`expect` exports with `createQuiz` and `adminApi` |
| `e2e/quiz-fixtures.spec.ts` | create | Tests for the helper |
| `e2e/stale-quizzes.cleanup.ts` | create | The sweep, run by the `cleanup` project |
| `playwright.config.ts` | modify | Add the `cleanup` project between `setup` and `chromium` |
| `e2e/host-dashboard.spec.ts`, `e2e/round-transitions.spec.ts` | rewrite | Host specs on their own quizzes |
| `e2e/player-reconnection.spec.ts`, `e2e/player-join.spec.ts`, `e2e/player-connection-status.spec.ts` | rewrite | Player specs on their own quizzes; connection-status drift |
| `src/components/host/player-list-with-status.tsx` | modify | The `data-testid` |
| `e2e/admin-quiz-crud.spec.ts`, `e2e/admin-question-crud.spec.ts` | modify | Admin specs on the fixture |
| `e2e/quiz.setup.ts`, `e2e/fixtures.ts` | delete | The shared-quiz lookup |
| `.gitignore`, `e2e/README.md` | modify | Drop `playwright/.quiz-info.json`; document the fixture |

---

### Task 1: Quiz fixture module, its tests and the cleanup project

**Agent:** `implementer`

**Files:**
- Create: `e2e/support/quiz-fixtures.ts`, `e2e/quiz-fixtures.spec.ts`, `e2e/stale-quizzes.cleanup.ts`
- Modify: `playwright.config.ts` (projects)

**Interfaces (produces — later tasks rely on these exact names):**

```ts
// e2e/support/quiz-fixtures.ts
import type { APIRequestContext, TestType, PlaywrightTestArgs, PlaywrightTestOptions,
  PlaywrightWorkerArgs, PlaywrightWorkerOptions } from '@playwright/test';

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

export const QUESTIONS: {
  /** multiple-choice; options Paris, London, Berlin, Rome; answer Paris */
  capitalOfFrance: QuestionSeed;
  /** multiple-choice; options Mercury, Venus, Jupiter, Mars; answer Jupiter */
  largestPlanet: QuestionSeed;
  /** text; "Name the largest ocean on Earth."; answer pacific */
  freeText: QuestionSeed;
  /** true/false; "True or false: water boils at 100°C at sea level."; answer True */
  trueFalse: QuestionSeed;
};

export type CreateQuizOptions = {
  /** short name of the spec, part of the title */
  label: string;
  /** added in this order; may be empty */
  questions: QuestionSeed[];
  /** start the quiz (Pending → Active) after adding the questions */
  start?: boolean;
};

export type TestQuiz = { id: string; joinCode: string; title: string };

/** request context with the admin session; the caller disposes it */
export function createAdminApi(): Promise<APIRequestContext>;

/**
 * POST /api/admin/quizzes { title, timePerQuestion: 30 }, then one
 * POST /api/admin/quizzes/{id}/questions per question, GET /api/admin/quizzes/{id} for the join
 * code, and POST /api/quiz/start { quizId } when start is true.
 * Title: `${FIXTURE_TITLE_PREFIX}${label} ${Date.now()}-${4 random [a-z0-9]}`.
 * If any step after the create fails, deletes the quiz, then rethrows.
 */
export function createTestQuiz(api: APIRequestContext, options: CreateQuizOptions): Promise<TestQuiz>;

/**
 * GET /api/admin/quizzes/{id}: 404 → return (already gone). Status 'Active' →
 * POST /api/admin/quizzes/{id}/reset. Then DELETE /api/admin/quizzes/{id}; a 404 there also
 * means already gone (another sweep won the race).
 */
export function deleteTestQuiz(api: APIRequestContext, quizId: string): Promise<void>;

/**
 * The creation time encoded in a fixture title: the number in the last ` <digits>` or
 * ` <digits>-<suffix>` at the end of the title; null when there is none.
 * 'E2E fixture host 1760000000000-ab12' → 1760000000000; 'E2E fixture host' → null.
 */
export function fixtureTimestamp(title: string): number | null;

/**
 * GET /api/admin/quizzes; deletes (deleteTestQuiz) every quiz whose title starts with titlePrefix
 * and whose fixtureTimestamp is not null and more than olderThanMs before now. Returns the
 * number deleted. Defaults: titlePrefix FIXTURE_TITLE_PREFIX, olderThanMs STALE_FIXTURE_AGE_MS.
 * (The list's createdAt is the request time, so it is not used: deviation 6.)
 */
export function sweepFixtureQuizzes(
  api: APIRequestContext,
  options?: { titlePrefix?: string; olderThanMs?: number }
): Promise<number>;

/** Playwright test with fixtures:
 *  adminApi (worker scope): createAdminApi(), disposed at worker end.
 *  createQuiz (test scope): (options) => createTestQuiz(adminApi, options); teardown calls
 *  deleteTestQuiz for every quiz it created, in creation order.
 */
export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & {
    createQuiz: (options: CreateQuizOptions) => Promise<TestQuiz>;
  },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & { adminApi: APIRequestContext }
>;
export { expect } from '@playwright/test';
```

Facts the implementation relies on (from the spec): create returns 201 `{ id }`; the question body
is `{ text, type, options?, correctAnswers, points? }`; `GET /api/admin/quizzes/{id}` returns the
quiz state with `status` ('Pending' | 'Active' | 'Completed') and `joinCode`; the list items carry
`id`, `title`, `status` (their `createdAt` is the request time, deviation 6); delete refuses an
Active quiz; reset accepts Active or Completed. Every request goes through one private helper that throws
`${method} ${path} failed: ${status} ${body}` on a non-2xx response.

**Config change** (`playwright.config.ts`, `projects`):

```ts
  projects: [
    // Setup project - runs first to authenticate
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Deletes fixture quizzes left by crashed runs (older than 30 minutes)
    {
      name: 'cleanup',
      testMatch: /.*\.cleanup\.ts/,
      dependencies: ['setup'],
    },
    // Authenticated tests - use saved auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['cleanup'],
    },
  ],
```

`e2e/stale-quizzes.cleanup.ts`: one test, `delete stale fixture quizzes`, that creates an admin
API context, calls `sweepFixtureQuizzes(api)`, logs `[CLEANUP] deleted <n> stale fixture
quizzes`, and disposes the context in `finally`.

- [ ] **Step 1: Write the failing tests** — `e2e/quiz-fixtures.spec.ts`:

```ts
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

    expect(quiz.title.startsWith(`${FIXTURE_TITLE_PREFIX}fixture-create `)).toBe(true);
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
    ).rejects.toThrow(/POST \/api\/admin\/quizzes\/[^/]+\/questions failed: 400/);

    const list = (await (
      await adminApi.get('/api/admin/quizzes')
    ).json()) as AdminQuizListItem[];
    expect(
      list.filter((item) => item.title.startsWith(`${FIXTURE_TITLE_PREFIX}${label}`))
    ).toEqual([]);
  });

  test('reads the timestamp from a fixture title', () => {
    expect(fixtureTimestamp('E2E fixture host 1760000000000-ab12')).toBe(1760000000000);
    expect(fixtureTimestamp('E2E fixture admin-quiz-crud 1760000000000')).toBe(1760000000000);
    expect(fixtureTimestamp('E2E fixture host')).toBeNull();
    expect(fixtureTimestamp('E2E fixture host 1760000000000 extra')).toBeNull();
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
      data: { title: `${FIXTURE_TITLE_PREFIX}${label} ${staleAt}-old1`, timePerQuestion: 30 },
    });
    expect(created.status()).toBe(201);
    const stale = (await created.json()) as { id: string };
    const fresh = await createQuiz({ label, questions: [] });

    const deleted = await sweepFixtureQuizzes(adminApi, {
      titlePrefix: `${FIXTURE_TITLE_PREFIX}${label}`,
    });

    expect(deleted).toBe(1);
    expect((await adminApi.get(`/api/admin/quizzes/${stale.id}`)).status()).toBe(404);
    expect((await adminApi.get(`/api/admin/quizzes/${fresh.id}`)).ok()).toBe(true);
  });

  test('sweep skips prefixed titles without a timestamp', async ({ adminApi }) => {
    const label = uniqueLabel('fixture-untimed');
    const created = await adminApi.post('/api/admin/quizzes', {
      data: { title: `${FIXTURE_TITLE_PREFIX}${label} no timestamp`, timePerQuestion: 30 },
    });
    expect(created.status()).toBe(201);
    const quiz = (await created.json()) as { id: string };

    try {
      const deleted = await sweepFixtureQuizzes(adminApi, {
        titlePrefix: `${FIXTURE_TITLE_PREFIX}${label}`,
        olderThanMs: 0,
      });

      expect(deleted).toBe(0);
      expect((await adminApi.get(`/api/admin/quizzes/${quiz.id}`)).ok()).toBe(true);
    } finally {
      await deleteTestQuiz(adminApi, quiz.id);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `yarn test:e2e e2e/quiz-fixtures.spec.ts --retries=0`
Expected: the run fails because `./support/quiz-fixtures` does not exist (module not found).

- [ ] **Step 3: Implement** `e2e/support/quiz-fixtures.ts` to the interface above,
  `e2e/stale-quizzes.cleanup.ts`, and the config change.

- [ ] **Step 4: Run them to see them pass**

Run: `yarn test:e2e e2e/quiz-fixtures.spec.ts --retries=0`
Expected: `11 passed` (setup `authenticate`, setup `fetch quiz info` — still present until
Task 4; dependency projects ignore the file filter — cleanup `delete stale fixture quizzes`, and
the 8 tests above; if the count differs, report the list). The output contains a
`[CLEANUP] deleted <n> stale fixture quizzes` line.

Run: `yarn eslint --fix e2e/support/quiz-fixtures.ts e2e/quiz-fixtures.spec.ts e2e/stale-quizzes.cleanup.ts playwright.config.ts`,
then `yarn lint` and `yarn -s tsc --noEmit -p .`
Expected: exit 0 both (lint warnings only in files this task did not touch).

- [ ] **Step 5: Commit**

```bash
git add e2e/support/quiz-fixtures.ts e2e/quiz-fixtures.spec.ts e2e/stale-quizzes.cleanup.ts playwright.config.ts
git commit -m "test(e2e): add a per-test quiz fixture and stale sweep"
```

---

### Task 2: Host specs on their own quizzes

**Agent:** `implementer`

**Files:**
- Rewrite: `e2e/host-dashboard.spec.ts`, `e2e/round-transitions.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect`, `QUESTIONS`, the `createQuiz` fixture (Task 1).
- Produces: nothing.

- [ ] **Step 1: Replace `e2e/host-dashboard.spec.ts`** with:

```ts
import { test, expect, QUESTIONS } from './support/quiz-fixtures';

/**
 * E2E test for the host dashboard. Each test gets its own Pending quiz.
 */
test.describe('Host Dashboard', () => {
  test('should display quiz information and controls', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'host-dashboard',
      questions: [QUESTIONS.capitalOfFrance, QUESTIONS.largestPlanet],
    });

    await page.goto(`/quiz/${quiz.id}`);

    // Verify quiz info
    await expect(page.getByRole('heading', { name: quiz.title })).toBeVisible();
    await expect(
      page.getByText(new RegExp(`join code.*${quiz.joinCode}`, 'i'))
    ).toBeVisible();

    // Status badge (scoped to banner to avoid matching player statuses)
    await expect(page.getByRole('banner').getByText(/Pending/)).toBeVisible();

    // Verify controls are present
    await expect(
      page.getByRole('button', { name: /start quiz/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /snapshot leaderboard/i })
    ).toBeVisible();

    // Verify sections are visible
    await expect(page.getByRole('heading', { name: /timer/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /leaderboard/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /questions/i })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /players/i })).toBeVisible();

    // Verify questions list (question text appears in more than one place)
    await expect(
      page.getByText(/What is the capital of France/i).first()
    ).toBeVisible();
  });

  test('should start quiz and update status', async ({ page, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'host-dashboard-start',
      questions: [QUESTIONS.capitalOfFrance, QUESTIONS.largestPlanet],
    });

    await page.goto(`/quiz/${quiz.id}`);
    await expect(page.getByRole('banner').getByText(/Pending/)).toBeVisible();

    await page.getByRole('button', { name: /start quiz/i }).click();

    await expect(page.getByRole('banner').getByText(/Active/)).toBeVisible({
      timeout: 5000,
    });

    // Timer running: the timer element shows "Remaining" or "Elapsed", "Timer Paused" otherwise
    await expect(page.getByRole('timer')).toContainText(/remaining|elapsed/i);

    // Controls for an Active quiz
    await expect(
      page.getByRole('button', { name: /finish quiz/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /next question/i })
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /reset timer/i })
    ).toBeEnabled();
  });
});
```

- [ ] **Step 2: Replace `e2e/round-transitions.spec.ts`** with:

```ts
import { test, expect, QUESTIONS } from './support/quiz-fixtures';

/**
 * E2E test for round transitions (answer locking), host side.
 * Each test gets its own Active quiz with two questions.
 */
test.describe('Round Transitions', () => {
  test.beforeEach(async ({ page, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'round-transitions',
      questions: [QUESTIONS.capitalOfFrance, QUESTIONS.largestPlanet],
      start: true,
    });
    await page.goto(`/quiz/${quiz.id}`);
    await expect(page.getByRole('banner').getByText(/Active/)).toBeVisible();
  });

  test('should show Lock Question button when quiz is active', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: /lock question/i })
    ).toBeEnabled();
  });

  test('should lock question and show round summary dialog', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /lock question/i }).click();

    await expect(
      page.getByRole('heading', { name: /round summary/i })
    ).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/correct answer/i)).toBeVisible();
    await expect(page.getByText(/players correct/i)).toBeVisible();
    await expect(page.getByText(/average time/i)).toBeVisible();

    await page.getByRole('button', { name: /continue/i }).click();
    await expect(
      page.getByRole('heading', { name: /round summary/i })
    ).not.toBeVisible();
  });

  test('should disable Lock Question after locking', async ({ page }) => {
    const lockButton = page.getByRole('button', { name: /lock question/i });

    await lockButton.click();
    await expect(
      page.getByRole('heading', { name: /round summary/i })
    ).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /continue/i }).click();

    // Locked until the next question
    await expect(lockButton).toBeDisabled();
  });

  test('should re-enable Lock Question after advancing', async ({ page }) => {
    const lockButton = page.getByRole('button', { name: /lock question/i });

    await lockButton.click();
    await expect(
      page.getByRole('heading', { name: /round summary/i })
    ).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(lockButton).toBeDisabled();

    await page.getByRole('button', { name: /next question/i }).click();

    await expect(lockButton).toBeEnabled({ timeout: 5000 });
  });
});
```

- [ ] **Step 3: Run both specs**

Run: `yarn test:e2e e2e/host-dashboard.spec.ts e2e/round-transitions.spec.ts --retries=0`
Expected: `9 passed` (2 setup, 1 cleanup, 2 host-dashboard, 4 round-transitions).

Run the same command again.
Expected: `9 passed` again (nothing carries over between runs).

- [ ] **Step 4: Commit**

```bash
git add e2e/host-dashboard.spec.ts e2e/round-transitions.spec.ts
git commit -m "test(e2e): give host specs their own quizzes"
```

---

### Task 3: Player specs on their own quizzes, connection-status drift

**Agent:** `implementer`

**Files:**
- Rewrite: `e2e/player-reconnection.spec.ts`, `e2e/player-connection-status.spec.ts`
- Modify: `e2e/player-join.spec.ts` (test 1 only), `src/components/host/player-list-with-status.tsx:79`

**Interfaces:**
- Consumes: `test`, `expect`, `QUESTIONS`, `TestQuiz`, the `createQuiz` fixture (Task 1).
- Produces: `data-testid="player-card-<playerId>"` on each host player card.

- [ ] **Step 1: Add the test id** in `src/components/host/player-list-with-status.tsx`, on the
  card `div` inside `players.map` (the one with `key={player.playerId}`):

```tsx
            <div
              key={player.playerId}
              data-testid={`player-card-${player.playerId}`}
              className="rounded-lg border border-border/80 px-3 py-2"
            >
```

- [ ] **Step 2: Replace `e2e/player-connection-status.spec.ts`** with:

```ts
import type { Page } from '@playwright/test';
import { test, expect, QUESTIONS } from './support/quiz-fixtures';

/**
 * Connection health indicators on the host dashboard.
 * The players list is mocked; each test gets its own Pending quiz so the page loads.
 * Mocks are installed before navigation so the first fetch is mocked too.
 */
type MockPlayer = {
  playerId: string;
  name: string;
  connectionStatus: 'connected' | 'away' | 'disconnected';
  lastSeenAt: string;
};

const mockPlayers = async (
  page: Page,
  quizId: string,
  players: () => MockPlayer[]
) => {
  await page.route(`/api/quiz/${quizId}/players/status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(players()),
    })
  );
};

const secondsAgo = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString();

test.describe('Player Connection Status', () => {
  test('host sees real-time player connection status', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'connection-status',
      questions: [QUESTIONS.capitalOfFrance],
    });
    await mockPlayers(page, quiz.id, () => [
      { playerId: 'p1', name: 'Alice', connectionStatus: 'connected', lastSeenAt: secondsAgo(5) },
      { playerId: 'p2', name: 'Bob', connectionStatus: 'away', lastSeenAt: secondsAgo(60) },
      { playerId: 'p3', name: 'Charlie', connectionStatus: 'disconnected', lastSeenAt: secondsAgo(150) },
    ]);

    await page.goto(`/quiz/${quiz.id}`);
    await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();

    const aliceCard = page.getByTestId('player-card-p1');
    const bobCard = page.getByTestId('player-card-p2');
    const charlieCard = page.getByTestId('player-card-p3');

    await expect(aliceCard.getByText('Connected', { exact: true })).toBeVisible();
    await expect(bobCard.getByText('Away', { exact: true })).toBeVisible();
    await expect(
      charlieCard.getByText('Disconnected', { exact: true })
    ).toBeVisible();

    // Summary counts
    await expect(page.getByText('1 connected')).toBeVisible();
    await expect(page.getByText('1 away')).toBeVisible();
    await expect(page.getByText('1 disconnected')).toBeVisible();

    // Last seen
    await expect(aliceCard.getByText(/just now|\ds ago/)).toBeVisible();
    await expect(bobCard.getByText(/1m ago/)).toBeVisible();
    await expect(charlieCard.getByText(/2m ago|3m ago/)).toBeVisible();
  });

  test('player status transitions over time', async ({ page, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'connection-transitions',
      questions: [QUESTIONS.capitalOfFrance],
    });
    const mockTime = Date.now();
    const player = (
      connectionStatus: MockPlayer['connectionStatus'],
      ageMs: number
    ): MockPlayer[] => [
      {
        playerId: 'p1',
        name: 'TestPlayer',
        connectionStatus,
        lastSeenAt: new Date(mockTime - ageMs).toISOString(),
      },
    ];

    await mockPlayers(page, quiz.id, () => player('connected', 5_000));
    await page.goto(`/quiz/${quiz.id}`);

    const card = page.getByTestId('player-card-p1');
    await expect(card.getByText('TestPlayer')).toBeVisible();
    await expect(card.getByText('Connected', { exact: true })).toBeVisible();

    // Later route handlers take precedence; the list refetches every 5 s
    await mockPlayers(page, quiz.id, () => player('away', 60_000));
    await expect(card.getByText('Away', { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await mockPlayers(page, quiz.id, () => player('disconnected', 150_000));
    await expect(card.getByText('Disconnected', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('handles API errors gracefully', async ({ page, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'connection-error',
      questions: [QUESTIONS.capitalOfFrance],
    });
    await page.route(`/api/quiz/${quiz.id}/players/status`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    );

    await page.goto(`/quiz/${quiz.id}`);

    // The players query retries twice (1 s, then 2 s) before showing the error
    await expect(
      page.getByText('Failed to load player connection status')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('handles quiz not found', async ({ page }) => {
    await page.goto('/quiz/nonexistent-quiz-id');

    // An unknown quiz renders the app's 404 page
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Replace `e2e/player-reconnection.spec.ts`** with:

```ts
import type { Page } from '@playwright/test';
import { test, expect, QUESTIONS, type TestQuiz } from './support/quiz-fixtures';

/**
 * Player reconnection after network disruptions.
 * Each test gets its own Active quiz whose first question is free text, so the play page
 * shows the "Type your answer" box.
 *
 * Manual testing observations (2026-01-31):
 * - ConnectionStatusBanner appears within ~1s of offline event
 * - Banner shows "Connection lost" with WifiOff icon
 * - Answer input disabled (placeholder changes to "Reconnecting…")
 * - Submit button disabled (text changes to "Reconnecting…")
 * - Auto-reconnection triggers immediately on 'online' event
 * - Banner disappears after successful reconnection
 * - Answer input re-enabled with "Type your answer" placeholder
 */

const joinAsPlayer = async (page: Page, quiz: TestQuiz) => {
  const playerName = `E2E Reconnect ${Date.now()}`;
  await page.goto('/join');
  await page.getByRole('textbox', { name: /join code/i }).fill(quiz.joinCode);
  await page.getByRole('textbox', { name: /your name/i }).fill(playerName);
  await page.getByRole('button', { name: /join quiz/i }).click();
  await page.waitForURL(new RegExp(`/play/${quiz.id}/[a-z0-9-]+`), {
    timeout: 30000,
  });
};

const setOnline = async (page: Page, online: boolean) => {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, online);
};

test.describe('Player Reconnection Flow', () => {
  let quiz: TestQuiz;

  test.beforeEach(async ({ page, createQuiz }) => {
    quiz = await createQuiz({
      label: 'player-reconnection',
      questions: [QUESTIONS.freeText, QUESTIONS.capitalOfFrance],
      start: true,
    });
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('should show offline banner when player disconnects', async ({
    page,
  }) => {
    await joinAsPlayer(page, quiz);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();

    await setOnline(page, false);

    const banner = page
      .getByRole('alert')
      .filter({ hasText: /connection lost/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/trying to reconnect/i);
    await expect(
      page.getByRole('textbox', { name: /reconnecting/i })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /reconnecting/i })
    ).toBeDisabled();
  });

  test('should auto-reconnect when network returns', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await setOnline(page, false);
    const banner = page
      .getByRole('alert')
      .filter({ hasText: /connection lost/i });
    await expect(banner).toBeVisible();

    await setOnline(page, true);

    await expect(banner).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /send answer/i })
    ).toBeVisible();
  });

  test('should disable answer submission while offline', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();

    await setOnline(page, false);

    await expect(
      page.getByRole('textbox', { name: /reconnecting/i })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /reconnecting/i })
    ).toBeDisabled();
  });

  test('should show reconnecting state during sync', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await setOnline(page, false);
    await expect(
      page.getByRole('alert').filter({ hasText: /connection lost/i })
    ).toBeVisible();

    await setOnline(page, true);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled({ timeout: 5000 });
  });

  test('should detect offline state immediately on load', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();

    await setOnline(page, false);
    const banner = page
      .getByRole('alert')
      .filter({ hasText: /connection lost/i });
    await expect(banner).toBeVisible();

    await setOnline(page, true);

    await expect(banner).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();
  });
});
```

(The old fixed `waitForTimeout(2000)` waits become assertion timeouts; the old
`submitButton.click({ force: true })` on a disabled button asserted nothing and is dropped.)

- [ ] **Step 4: Change `e2e/player-join.spec.ts`**:
  - imports: `import { test, expect } from './support/quiz-fixtures';` (drop `./fixtures`, drop the
    `QUIZ_ID` / `JOIN_CODE` constants);
  - test 1 takes `{ page, createQuiz }` and starts with
    `const quiz = await createQuiz({ label: 'player-join', questions: [QUESTIONS.capitalOfFrance], start: true });`
    (import `QUESTIONS` too); `quizId` → `quiz.id`, `joinCode` → `quiz.joinCode`;
  - `await expect(page.getByText(/Quiz: Trivia Night Demo/i)).toBeVisible();` becomes
    `await expect(page.getByText(`Quiz: ${quiz.title}`)).toBeVisible();`;
  - tests 2 and 3 unchanged.

- [ ] **Step 5: Run the player specs**

Run (before the lint step, `yarn eslint --fix` on the files you touched):
`yarn test:e2e e2e/player-connection-status.spec.ts e2e/player-reconnection.spec.ts e2e/player-join.spec.ts --retries=0 2>&1 | tee <scratch>/task3-e2e.txt`,
then `command grep -c 'Too many requests' <scratch>/task3-e2e.txt` and
`command grep -rl 'Too many requests' test-results/ || true`.
Expected: `15 passed` (2 setup, 1 cleanup, 4 connection-status, 5 reconnection, 3 player-join);
both greps find nothing (the first prints `0`). Report the counts from the run's own summary
line, not from the pipe's exit status.

Run: `yarn test:run`
Expected: exit 0, same counts as master (the `data-testid` changes no unit test).

- [ ] **Step 6: Commit**

```bash
git add e2e/player-connection-status.spec.ts e2e/player-reconnection.spec.ts e2e/player-join.spec.ts src/components/host/player-list-with-status.tsx
git commit -m "test(e2e): give player specs their own quizzes"
```

---

### Task 4: Admin specs on the fixture; remove the shared-quiz lookup

**Agent:** `implementer`

**Files:**
- Modify: `e2e/admin-quiz-crud.spec.ts`, `e2e/admin-question-crud.spec.ts:1-25`, `.gitignore`,
  `e2e/README.md`
- Delete: `e2e/quiz.setup.ts`, `e2e/fixtures.ts`

**Interfaces:**
- Consumes: `test`, `expect`, `QUESTIONS`, `FIXTURE_TITLE_PREFIX`, the `createQuiz` fixture.
- Produces: nothing.

- [ ] **Step 1: `e2e/admin-quiz-crud.spec.ts`**
  - import `test`, `expect`, `QUESTIONS`, `FIXTURE_TITLE_PREFIX` from `./support/quiz-fixtures`;
  - the titles created through the UI become
    `${FIXTURE_TITLE_PREFIX}admin-quiz-crud ${Date.now()}`,
    `${FIXTURE_TITLE_PREFIX}admin-quiz-update ${Date.now()}` and
    `${FIXTURE_TITLE_PREFIX}admin-quiz-delete ${Date.now()}`, so the sweep removes what the tests
    leave;
  - the last test becomes:

```ts
  test('should not show edit/delete buttons for active quiz', async ({
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'admin-quiz-list',
      questions: [QUESTIONS.capitalOfFrance],
      start: true,
    });
    await quizzesPage.goto();

    const row = quizzesPage.getQuizRow(quiz.title);
    await expect(row.getByText('Active', { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // Only Pending quizzes have Edit and Delete buttons
    expect(await quizzesPage.hasEditButton(quiz.title)).toBe(false);
    await expect(row.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });
```

- [ ] **Step 2: `e2e/admin-question-crud.spec.ts`** — import `test`, `expect` from
  `./support/quiz-fixtures`, and replace the `beforeEach` with:

```ts
  test.beforeEach(async ({ page, createQuiz }) => {
    const quiz = await createQuiz({ label: 'admin-question-crud', questions: [] });
    quizId = quiz.id;

    detailPage = new AdminQuizDetailPage(page);
    await detailPage.goto(quizId);
  });
```

- [ ] **Step 3: Remove the shared-quiz lookup**
  - `git rm e2e/quiz.setup.ts e2e/fixtures.ts`;
  - `.gitignore`: delete the `/playwright/.quiz-info.json` line;
  - `git grep -n -E "getQuizId|getJoinCode|getQuizInfo|quiz-info|TEST_QUIZ_ID|TEST_JOIN_CODE" -- e2e playwright.config.ts .gitignore`
    must print nothing.

- [ ] **Step 4: `e2e/README.md`** — change line 11 ("All test projects depend on the setup
  project…") to say the order is `setup` → `cleanup` → `chromium` and chromium uses the saved
  auth state; in "Test Structure", add:
  - `support/quiz-fixtures.ts` — `createQuiz` fixture: each test that needs a quiz gets its own,
    created through the admin API and deleted after the test (titles start with `E2E fixture `);
  - `stale-quizzes.cleanup.ts` — `cleanup` project: deletes fixture quizzes older than 30
    minutes, left by crashed runs;
  - `quiz-fixtures.spec.ts` — tests for the fixture itself;
  and remove any statement that E2E uses the seeded quiz or `JOIN-KYTX`
  (`git grep -n -i "JOIN-KYTX\|quiz.setup" -- e2e` prints nothing afterwards).

- [ ] **Step 5: Run the admin specs and the whole suite once**

Run: `yarn test:e2e e2e/admin-quiz-crud.spec.ts e2e/admin-question-crud.spec.ts --retries=0`
Expected: `14 passed` (1 setup, 1 cleanup, 4 admin-quiz-crud, 8 admin-question-crud).

Run: `yarn test:e2e --retries=0`
Expected: 0 failed; report the passed count and any skipped or flaky test by name.

Run: `yarn lint` and `yarn -s tsc --noEmit -p .`
Expected: exit 0 both.

- [ ] **Step 6: Commit**

```bash
git add -A e2e .gitignore
git commit -m "test(e2e): move admin specs to the fixture, drop the shared quiz"
```

---

### Task 4b: Database pool size from the environment (added 2026-10-18)

**Agent:** `implementer`

Why: spec section 6; findings `docs/progress/findings/2026-10-18-e2e-db-pool-queueing.md`.

**Files:**
- Create: `src/infrastructure/database/prisma/pool-size.ts`,
  `src/tests/infrastructure/database/prisma/pool-size.test.ts`
- Modify: `src/infrastructure/database/prisma/client.ts`, `.env.example`
- Not in git: the worktree's `.env.development.local` holds `DATABASE_POOL_MAX=10` (written by the
  controller; `.env.local` is a symlink to the main checkout's, which this branch doesn't touch;
  Next loads `.env.development.local` over `.env.local` in dev).

**Interface:**

```ts
// pool-size.ts
export const DEFAULT_POOL_MAX = 2;
/** Pool size for the pg adapter: unset or blank → DEFAULT_POOL_MAX; throws on anything but a positive integer. */
export function resolvePoolMax(value: string | undefined): number;
```

`client.ts` passes `max: resolvePoolMax(process.env.DATABASE_POOL_MAX)` and keeps its comment's
reason for the low default (serverless instances each open a pool).

**Tests** (`pool-size.test.ts`, no mocks):

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POOL_MAX,
  resolvePoolMax,
} from '@infrastructure/database/prisma/pool-size';

describe('resolvePoolMax', () => {
  it('defaults to 2 when unset or blank', () => {
    expect(DEFAULT_POOL_MAX).toBe(2);
    expect(resolvePoolMax(undefined)).toBe(2);
    expect(resolvePoolMax('')).toBe(2);
    expect(resolvePoolMax('  ')).toBe(2);
  });

  it('uses a positive integer', () => {
    expect(resolvePoolMax('10')).toBe(10);
    expect(resolvePoolMax(' 4 ')).toBe(4);
  });

  it.each(['0', '-1', '2.5', 'ten', '10abc'])('throws on %s', (value) => {
    expect(() => resolvePoolMax(value)).toThrow(/DATABASE_POOL_MAX/);
  });
});
```

**Acceptance:**
- `yarn test:run src/tests/infrastructure/database/prisma/pool-size.test.ts` fails before the
  helper exists, passes after.
- `yarn test:run`, `yarn lint`, `yarn -s tsc --noEmit -p .`: exit 0.
- After the user restarts the dev server with the new `.env.local`: the full
  `yarn test:e2e --retries=0` (controller, Task 5 style counts).

Commit: `perf(db): size the pg pool from DATABASE_POOL_MAX`.

### Task 5b: Join rate limit from the environment (added 2026-10-18)

**Agent:** `implementer`

Why: spec section 7; Task 5's second back-to-back run (ledger).

**Files:**
- Modify: `src/lib/rate-limit.ts` (add `resolveRateLimit`), `src/app/api/session/join/route.ts`,
  `src/tests/lib/rate-limit.test.ts`, `.env.example`
- Not in git: `SESSION_JOIN_RATE_LIMIT=100` in the worktree's `.env.development.local` (controller).

**Interface:**

```ts
// src/lib/rate-limit.ts
/** Limit from an env value: unset or blank → fallback; throws on anything but a positive integer. */
export const resolveRateLimit = (value: string | undefined, fallback: number): number;
```

The join route resolves it once at module scope
(`const SESSION_JOIN_LIMIT = resolveRateLimit(process.env.SESSION_JOIN_RATE_LIMIT, 10);`) and
passes it as `limit`.

**Tests** (added to `src/tests/lib/rate-limit.test.ts`):

```ts
  describe('resolveRateLimit', () => {
    it('falls back when unset or blank', () => {
      expect(resolveRateLimit(undefined, 10)).toBe(10);
      expect(resolveRateLimit('', 10)).toBe(10);
      expect(resolveRateLimit('  ', 10)).toBe(10);
    });

    it('uses a positive integer', () => {
      expect(resolveRateLimit('100', 10)).toBe(100);
      expect(resolveRateLimit(' 5 ', 10)).toBe(5);
    });

    it.each(['0', '-1', '2.5', 'ten', '10abc'])('throws on %s', (value) => {
      expect(() => resolveRateLimit(value, 10)).toThrow(/positive integer/);
    });
  });
```

**Acceptance:**
- The new tests fail before `resolveRateLimit` exists, pass after.
- `yarn test:run`, `yarn lint`, `yarn -s tsc --noEmit -p .`: exit 0.
- After the user restarts the dev server: Task 5's two back-to-back full runs (controller).

Commit: `feat(api): let the join rate limit come from the environment`.

### Task 5: Verification and records (main session)

**Agent:** none — the controller runs this; counts come from the runs' own output.

- [ ] Two full `yarn test:e2e` runs back to back (default retries). Expected: 0 failed in both;
  any flaky test is named with its error.
- [ ] Each run saved with `2>&1 | tee` to the scratchpad; `Too many requests` appears in neither
  output nor in `test-results/**/error-context.md` (filter password lines when reading those).
- [ ] After the runs, `GET /api/admin/quizzes` (through the admin API) lists no quiz whose title
  starts with `E2E fixture ` except ones from a run in progress (report the count).
- [ ] `yarn test:run`, `yarn lint`, `tsc`: exit 0.
- [ ] List the leftovers from earlier runs for the user's approval (no deletion without it):
  quizzes titled `Question CRUD Test …`, `E2E Test Quiz …`, `Update Test …`, and the E2E players
  on the JOIN-KYTX quiz, with counts.
- [ ] Ledger `.superpowers/sdd/2026-10-15-e2e-isolated-quizzes/progress.md` (`git add -f`), spec
  and plan status lines, the security item (unauthenticated `/api/quiz/*` host routes; the rate
  limiter trusting `x-forwarded-for`) recorded where the user chooses.
