import { test, expect, QUESTIONS } from './support/quiz-fixtures';
import { joinAsPlayer, submitJoinForm } from './support/player-join';

/**
 * E2E test for player join flow.
 * Based on actual MCP-tested behavior.
 */

test.describe('Player Join Flow', () => {
  test('should join quiz and navigate to play page', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'player-join',
      questions: [QUESTIONS.capitalOfFrance],
      start: true,
    });
    const playerName = await joinAsPlayer(page, quiz);

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
    const response = await submitJoinForm(page, 'INVALID', 'Test Player');

    // The use case's not-found error, not the form's fallback for any failure
    expect(response.status()).toBe(404);
    await expect(page.getByText(/was not found/i)).toBeVisible();

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
