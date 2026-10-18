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
