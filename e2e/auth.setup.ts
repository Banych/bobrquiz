/**
 * Global authentication setup for Playwright E2E tests.
 * Signs the shared test host in through the email link's confirm page (no email is sent: the
 * link comes from the service-role key's generateLink) and saves the session to
 * playwright/.auth/user.json for every spec to reuse.
 */

import { test as setup, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './support/paths';
import { signInThroughEmailLink } from './support/email-sign-in';

setup('authenticate', async ({ page, context }) => {
  const testEmail = process.env.TEST_ADMIN_EMAIL;

  if (!testEmail) {
    throw new Error(
      'TEST_ADMIN_EMAIL is required for E2E tests (.env.local), with SUPABASE_SERVICE_ROLE_KEY ' +
        'for signing it in. See e2e/README.md.'
    );
  }

  await signInThroughEmailLink(page, testEmail, '/admin/quizzes');
  await expect(page.getByRole('heading', { name: /quizzes/i })).toBeVisible();

  await context.storageState({ path: ADMIN_STORAGE_STATE });
});
