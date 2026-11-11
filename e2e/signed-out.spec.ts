import { test, expect, QUESTIONS } from './support/quiz-fixtures';
import { joinAsPlayer } from './support/player-join';

/**
 * Every other spec runs signed in as the e2e admin (playwright.config.ts), which would hide a
 * host page that stopped asking for a login and a player flow that started needing one. The
 * fixture quizzes are still created through the admin API context, which keeps its session.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Signed out', () => {
  test('host pages redirect to login', async ({ page, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'signed-out-host',
      questions: [QUESTIONS.freeText],
    });

    for (const path of ['/host', `/quiz/${quiz.id}`, `/quiz/${quiz.id}/live`]) {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?redirect=${encodeURIComponent(path)}$`)
      );
    }
  });

  test('a player joins and answers with no session', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'signed-out-player',
      questions: [QUESTIONS.freeText],
      start: true,
    });

    await joinAsPlayer(page, quiz);

    const answerBox = page.getByRole('textbox', { name: /type your answer/i });
    await expect(answerBox).toBeEnabled();
    await answerBox.fill('Pacific');
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/player/answer') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /send answer/i }).click(),
    ]);

    expect(response.status(), await response.text()).toBe(200);
    const authCookies = (await page.context().cookies()).filter((cookie) =>
      cookie.name.includes('auth-token')
    );
    expect(authCookies).toEqual([]);
  });
});
