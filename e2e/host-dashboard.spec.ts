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

    // Verify questions list. The Timer panel repeats the active question's
    // text, so scope to the timeline's ordered list (the only <ol> on the page).
    const questionList = page.locator('ol');
    await expect(
      questionList.getByText(QUESTIONS.capitalOfFrance.text)
    ).toBeVisible();
    await expect(
      questionList.getByText(QUESTIONS.largestPlanet.text)
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
