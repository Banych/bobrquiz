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
      {
        playerId: 'p1',
        name: 'Alice',
        connectionStatus: 'connected',
        lastSeenAt: secondsAgo(5),
      },
      {
        playerId: 'p2',
        name: 'Bob',
        connectionStatus: 'away',
        lastSeenAt: secondsAgo(60),
      },
      {
        playerId: 'p3',
        name: 'Charlie',
        connectionStatus: 'disconnected',
        lastSeenAt: secondsAgo(150),
      },
    ]);

    await page.goto(`/quiz/${quiz.id}`);
    await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();

    const aliceCard = page.getByTestId('player-card-p1');
    const bobCard = page.getByTestId('player-card-p2');
    const charlieCard = page.getByTestId('player-card-p3');

    await expect(
      aliceCard.getByText('Connected', { exact: true })
    ).toBeVisible();
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
