import { test, expect, QUESTIONS } from './support/quiz-fixtures';

/**
 * E2E test for player join flow.
 * Based on actual MCP-tested behavior.
 */

test.describe('Player Join Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('should join quiz and navigate to play page', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'player-join',
      questions: [QUESTIONS.capitalOfFrance],
      start: true,
    });
    // Generate unique player name to avoid database constraint
    const playerName = `E2E Player ${Date.now()}`;

    // Navigate to join page
    await page.goto('/join');
    await expect(page).toHaveURL('/join');

    // Fill join form
    await page.getByRole('textbox', { name: /join code/i }).fill(quiz.joinCode);
    await page.getByRole('textbox', { name: /your name/i }).fill(playerName);

    // Submit form
    await page.getByRole('button', { name: /join quiz/i }).click();

    // Wait for navigation to play page (30s timeout for API + navigation)
    await page.waitForURL(new RegExp(`/play/${quiz.id}/[a-z0-9-]+`), {
      timeout: 30000,
    });

    // Verify we're on play page
    await expect(page).toHaveURL(new RegExp(`/play/${quiz.id}/[a-z0-9-]+`));

    // Verify player info is displayed
    await expect(page.getByRole('heading', { name: playerName })).toBeVisible();
    await expect(page.getByText(`Quiz: ${quiz.title}`)).toBeVisible();
    await expect(page.getByText(/Status: Active/i)).toBeVisible();

    // Verify localStorage contains session
    const session = await page.evaluate(() => {
      const raw = window.localStorage.getItem('quiz-game-player-session');
      return raw ? JSON.parse(raw) : null;
    });

    expect(session).toBeTruthy();
    expect(session.quizId).toBe(quiz.id);
    expect(session.playerName).toBe(playerName);
    expect(session.playerId).toBeTruthy();
  });

  test('should show error when join code is invalid', async ({ page }) => {
    await page.goto('/join');

    // Try to join with invalid code
    await page.getByRole('textbox', { name: /join code/i }).fill('INVALID');
    await page.getByRole('textbox', { name: /your name/i }).fill('Test Player');
    await page.getByRole('button', { name: /join quiz/i }).click();

    // Wait and check for error message
    await expect(page.getByText(/not found|invalid|unable/i)).toBeVisible({
      timeout: 5000,
    });

    // Should still be on join page
    await expect(page).toHaveURL('/join');
  });

  test('should show resume session when localStorage exists', async ({
    page,
  }) => {
    // Set a session in localStorage
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem(
        'quiz-game-player-session',
        JSON.stringify({
          quizId: 'cmjd39h6o0000g18o0s8eq6cp',
          playerId: '49794208-0ca4-4de0-b459-f5a6c34731df',
          playerName: 'Alex',
        })
      );
    });

    // Navigate to join page
    await page.goto('/join');

    // Should show resume session UI
    await expect(page.getByText(/resume previous session/i)).toBeVisible();
    await expect(page.getByText(/Alex/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /reopen session/i })
    ).toBeVisible();
  });
});
