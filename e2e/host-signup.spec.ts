import { test, expect } from '@playwright/test';
import { BASE_URL } from './support/paths';
import {
  createConfirmedUserWithPassword,
  deleteUserByEmail,
  newSignupEmail,
  sessionCookies,
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

  // A production build prefetches the home page's Host link while the visitor is signed out and
  // keeps the redirect to /login it got back; signing in must not replay it (production,
  // 2026-11-15: the new host stayed on the sign-in page). A dev server never prefetches, so this
  // catches that only against `yarn build && yarn start` (e2e/README.md).
  test('a visitor from the home page signs up with the code and lands on the host page', async ({
    page,
  }) => {
    const email = newSignupEmail();

    try {
      await page.goto('/');
      const hostLink = page.getByRole('link', { name: 'Host Game' });
      await hostLink.scrollIntoViewIfNeeded();
      await hostLink.hover();
      await page.waitForLoadState('networkidle');
      await hostLink.click();
      await expect(page).toHaveURL(/\/login\?redirect=%2Fhost$/);

      await signInWithCode(page, email);

      await expect(page).toHaveURL(`${BASE_URL}/host`);
      await expect(page.getByText('No quizzes found')).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  // Anyone can sign an address up with a password before its owner signs in by email, and that
  // password still works once the owner confirms the address; the app must refuse such a session
  test('a password session of a confirmed account is not a host session', async ({
    page,
    context,
  }) => {
    const email = newSignupEmail();
    const password = `Pw-${Date.now()}-${Math.random().toString(36).slice(2)}!`;

    try {
      await createConfirmedUserWithPassword(email, password);

      await context.addCookies(await sessionCookies(email, { password }));
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/);
      expect((await page.request.get('/api/admin/quizzes')).status()).toBe(401);

      // The same cookies from an emailed code pass, so the refusal is about the password
      await context.clearCookies();
      await context.addCookies(await sessionCookies(email, 'code'));
      await page.goto('/admin');
      await expect(page).toHaveURL(`${BASE_URL}/admin`);
      expect((await page.request.get('/api/admin/quizzes')).status()).toBe(200);
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
