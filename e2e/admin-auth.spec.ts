import { test, expect } from '@playwright/test';
import { BASE_URL } from './support/paths';
import {
  confirmPageUrl,
  generateSignInLink,
  interceptSignInEmail,
  signInThroughEmailLink,
  signInWithCode,
} from './support/email-sign-in';

// Use unauthenticated context for auth tests to avoid interfering with other tests
const authTest = test.extend({
  storageState: { cookies: [], origins: [] },
});

// A separate host account: the logout test signs out every session of the user it signs in
// as (supabase signOut defaults to scope 'global'), which would revoke the session
// auth.setup.ts saves for the other specs if both used one account.
const hostEmail = process.env.TEST_AUTH_ADMIN_EMAIL;

if (
  hostEmail &&
  hostEmail.toLowerCase() === process.env.TEST_ADMIN_EMAIL?.toLowerCase()
) {
  throw new Error(
    'TEST_AUTH_ADMIN_EMAIL must differ from TEST_ADMIN_EMAIL: the logout test would revoke the shared admin session.'
  );
}

const requireHostEmail = (): string => {
  authTest.skip(!hostEmail, 'TEST_AUTH_ADMIN_EMAIL env var required');
  return hostEmail!;
};

// Serial: every test signs the same account in, and a newer code voids the older one
authTest.describe.configure({ mode: 'serial' });

authTest.describe('Host sign-in', () => {
  authTest('redirects signed-out visitors to sign-in', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/);
    await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });

  authTest(
    'signs in with the emailed code and opens the dashboard',
    async ({ page }) => {
      const email = requireHostEmail();
      await page.goto('/login');

      await signInWithCode(page, email);

      await expect(page).toHaveURL(`${BASE_URL}/admin`);
      await expect(
        page.getByRole('heading', { name: 'Admin Dashboard' })
      ).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'Quizzes' })
      ).toBeVisible();
    }
  );

  authTest(
    'shows the waiting screen, refuses a wrong code and goes back to the email step',
    async ({ page }) => {
      const email = requireHostEmail();
      await interceptSignInEmail(page);
      await page.goto('/login');

      await page.getByRole('textbox', { name: 'Email' }).fill(email);
      await page
        .getByRole('button', { name: 'Email me a sign-in link' })
        .click();

      await expect(page.getByText('Check your email')).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^Resend \(in \d+ s\)$/ })
      ).toBeDisabled();

      await page.getByRole('textbox', { name: 'Code' }).fill('00000000');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      // Next's route announcer is a role=alert too; match the message
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'That code is wrong or has expired' })
      ).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);

      await page.getByRole('button', { name: 'Use another email' }).click();
      await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(
        email
      );
    }
  );

  authTest('explains a refused send in words', async ({ page }) => {
    const refusals = [
      { status: 429, error_code: 'over_email_send_rate_limit' },
      { status: 400, error_code: 'captcha_failed' },
    ];
    await page.route('**/auth/v1/otp*', async (route) => {
      const { status, error_code } = refusals.shift()!;
      await route.fulfill({ status, json: { error_code, msg: 'refused' } });
    });
    await page.goto('/login');
    await page
      .getByRole('textbox', { name: 'Email' })
      .fill('nobody@example.com');
    const send = page.getByRole('button', { name: 'Email me a sign-in link' });

    await send.click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Wait a minute' })
    ).toBeVisible();

    // A refused send uses up the Turnstile token too; the button waits for a new one
    await send.click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'The bot check failed' })
    ).toBeVisible();
    await expect(page.getByText('Check your email')).toHaveCount(0);
  });

  authTest(
    'unlocks Resend after 60 seconds and sends again with a new bot check',
    async ({ page }) => {
      await page.clock.install();
      const caught = await interceptSignInEmail(page);
      await page.goto('/login');
      await page
        .getByRole('textbox', { name: 'Email' })
        .fill('nobody@example.com');
      await page
        .getByRole('button', { name: 'Email me a sign-in link' })
        .click();
      await expect(
        page.getByRole('button', { name: /^Resend \(in \d+ s\)$/ })
      ).toBeDisabled();

      // One step at a time: the countdown schedules its next second after each render
      for (let second = 0; second < 61; second += 1) {
        await page.clock.runFor(1000);
      }
      await page.getByRole('button', { name: 'Resend email' }).click();

      await expect.poll(() => caught.length).toBe(2);
      const tokens = caught.map(
        ({ body }) =>
          (body.gotrue_meta_security as { captcha_token?: string })
            ?.captcha_token
      );
      expect(tokens[1]).toEqual(expect.any(String));
      await expect(
        page.getByRole('button', { name: /^Resend \(in \d+ s\)$/ })
      ).toBeDisabled();
    }
  );

  authTest('logs out and redirects to sign-in', async ({ page }) => {
    const email = requireHostEmail();
    await page.goto('/login');
    await signInWithCode(page, email);
    await expect(page).toHaveURL(`${BASE_URL}/admin`);

    await page.getByRole('button', { name: 'Logout' }).click();

    await expect(page).toHaveURL(`${BASE_URL}/login`);
    await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
  });

  authTest(
    'returns to the originally requested page after the code',
    async ({ page }) => {
      const email = requireHostEmail();
      await page.goto('/admin/quizzes');
      await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fquizzes$/);

      const [sent] = await signInWithCode(page, email);

      await expect(page).toHaveURL(`${BASE_URL}/admin/quizzes`);
      await expect(
        page.getByRole('heading', { name: 'Quizzes' })
      ).toBeVisible();
      // The email link carries the same return address
      expect(sent.url.searchParams.get('redirect_to')).toBe(
        `${BASE_URL}/admin/quizzes`
      );
    }
  );

  authTest(
    'signs in through the email link only after Continue, and the link works once',
    async ({ page }) => {
      const email = requireHostEmail();
      const { tokenHash } = await generateSignInLink(email);
      const url = confirmPageUrl(tokenHash, '/admin/quizzes');

      // Opening the link verifies nothing: a mail scanner cannot use it up
      await page.goto(url);
      await page.goto(url);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page).toHaveURL(`${BASE_URL}/admin/quizzes`);

      await page.context().clearCookies();
      await page.goto(url);
      await page.getByRole('button', { name: 'Continue' }).click();
      // Next's route announcer is a role=alert too; match the message
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'already used or has expired' })
      ).toBeVisible();
      await page.getByRole('link', { name: 'Back to sign in' }).click();
      await expect(page).toHaveURL(`${BASE_URL}/login`);
    }
  );

  authTest(
    'lands on /admin when the link points at another site',
    async ({ page }) => {
      const email = requireHostEmail();
      const { tokenHash } = await generateSignInLink(email);
      const params = new URLSearchParams({
        token_hash: tokenHash,
        type: 'email',
        next: 'https://evil.example/admin/quizzes',
      });

      await page.goto(`/auth/confirm?${params}`);
      await page.getByRole('button', { name: 'Continue' }).click();

      await expect(page).toHaveURL(`${BASE_URL}/admin`);
    }
  );

  authTest('keeps the session across page reloads', async ({ page }) => {
    const email = requireHostEmail();
    await signInThroughEmailLink(page, email, '/admin');

    await page.reload();

    await expect(page).toHaveURL(`${BASE_URL}/admin`);
    await expect(page.getByText('Admin Dashboard')).toBeVisible();
  });
});
