/**
 * Global authentication setup for Playwright E2E tests.
 * Creates an authenticated session and saves it to .auth/user.json
 * so all tests can reuse the same authentication state.
 */

import { test as setup, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE } from './support/paths';

const authFile = ADMIN_STORAGE_STATE;

setup('authenticate', async ({ page, context }) => {
  const testEmail = process.env.TEST_ADMIN_EMAIL;
  const testPassword = process.env.TEST_ADMIN_PASSWORD;

  if (!testEmail || !testPassword) {
    throw new Error(
      'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables are required for E2E tests.\n' +
        'Add them to .env.local:\n' +
        'TEST_ADMIN_EMAIL=test@example.com\n' +
        'TEST_ADMIN_PASSWORD=your-test-password\n\n' +
        'Make sure this email is also in ADMIN_EMAILS allowlist.'
    );
  }

  console.log('[AUTH SETUP] Authenticating as:', testEmail);

  // Navigate to login page
  await page.goto('/login');

  // Wait for login form to be visible
  await expect(page.getByText('Admin Login')).toBeVisible({
    timeout: 10000,
  });

  // Fill in credentials
  await page.getByLabel(/email/i).fill(testEmail);
  await page.getByLabel(/password/i).fill(testPassword);

  // Click sign in button
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for successful authentication - should redirect to admin page or see authenticated content
  // Try different possible success indicators
  try {
    // Option 1: Redirected to admin/quizzes
    await page.waitForURL(/\/admin/, { timeout: 10000 });
  } catch {
    // Option 2: Wait for any indication we're logged in (could be a user menu, etc.)
    await page.waitForTimeout(2000);
  }

  // Verify we can access an admin route
  await page.goto('/admin/quizzes');

  // Check that we're not redirected to login
  await expect(page).toHaveURL(/\/admin\/quizzes/, { timeout: 10000 });

  // Verify the page loaded successfully (should see "Quizzes" heading)
  await expect(page.getByRole('heading', { name: /quizzes/i })).toBeVisible({
    timeout: 10000,
  });

  console.log('[AUTH SETUP] Successfully authenticated and verified access');

  // Save the authenticated state to file
  await context.storageState({ path: authFile });

  console.log('[AUTH SETUP] Saved auth state to:', authFile);
});
