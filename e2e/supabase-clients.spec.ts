import { test, expect, type Page } from '@playwright/test';

/**
 * auth-js warns "Multiple GoTrueClient instances detected in the same
 * browser context" when a second GoTrueClient is created under a storage
 * key already in use. The anonymous realtime and presence clients each
 * have their own key, separate from the @supabase/ssr auth client's, and
 * the realtime client is cached so React Strict Mode's double-invoked
 * initializers share one instance.
 */
const DUPLICATE_CLIENT_WARNING = 'Multiple GoTrueClient';

const collectConsoleMessages = (page: Page): string[] => {
  const messages: string[] = [];
  page.on('console', (message) => {
    messages.push(message.text());
  });
  return messages;
};

test.describe('Supabase browser clients', () => {
  test.describe('anonymous visitor', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('home page creates no duplicate GoTrueClient', async ({ page }) => {
      const messages = collectConsoleMessages(page);

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      expect(
        messages.filter((text) => text.includes(DUPLICATE_CLIENT_WARNING))
      ).toEqual([]);
    });
  });

  test.describe('authenticated admin', () => {
    // Uses the chromium project's saved admin storageState (auth.setup.ts).
    test('admin quizzes page creates no duplicate GoTrueClient', async ({
      page,
    }) => {
      const messages = collectConsoleMessages(page);

      await page.goto('/admin/quizzes');
      await expect(page).toHaveURL(/\/admin\/quizzes/);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /quizzes/i })).toBeVisible(
        { timeout: 10000 }
      );

      expect(
        messages.filter((text) => text.includes(DUPLICATE_CLIENT_WARNING))
      ).toEqual([]);
    });
  });
});
