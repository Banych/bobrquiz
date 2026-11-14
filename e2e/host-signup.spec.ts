import { test, expect } from '@playwright/test';
import { BASE_URL } from './support/paths';
import {
  deleteUserByEmail,
  newSignupEmail,
  signInWithCode,
} from './support/email-sign-in';
import {
  QUESTIONS,
  createTestQuiz,
  deleteTestQuiz,
} from './support/quiz-fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Host sign-up', () => {
  test('a new address signs up with the emailed code and hosts a quiz', async ({
    page,
  }) => {
    const email = newSignupEmail();
    let quizId: string | undefined;

    try {
      await page.goto('/host');
      await expect(page).toHaveURL(/\/login\?redirect=%2Fhost$/);

      const [sent] = await signInWithCode(page, email);

      // The form sent the Turnstile token and the return address with the email
      expect(sent.body.email).toBe(email);
      expect(sent.body.gotrue_meta_security).toMatchObject({
        captcha_token: expect.any(String),
      });
      expect(sent.url.searchParams.get('redirect_to')).toBe(`${BASE_URL}/host`);

      // A new host sees none of the existing quizzes
      await expect(page).toHaveURL(`${BASE_URL}/host`);
      await expect(page.getByText('No quizzes found')).toBeVisible();

      // ...and can create and start one as its owner
      const quiz = await createTestQuiz(page.request, {
        label: 'host-signup',
        questions: [QUESTIONS.freeText],
        start: true,
      });
      quizId = quiz.id;

      await page.goto('/host');
      await expect(page.getByText(quiz.title)).toBeVisible();
      await page.goto(`/quiz/${quiz.id}/live`);
      await expect(page).toHaveURL(`${BASE_URL}/quiz/${quiz.id}/live`);
    } finally {
      // The user goes even when the quiz delete fails, and that failure doesn't hide the test's
      if (quizId) {
        await deleteTestQuiz(page.request, quizId).catch((error: unknown) =>
          console.warn(
            `[SIGNUP] deleting quiz ${quizId} failed: ${String(error)}`
          )
        );
      }
      await deleteUserByEmail(email);
    }
  });
});
