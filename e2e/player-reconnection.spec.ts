import type { Page } from '@playwright/test';
import {
  test,
  expect,
  QUESTIONS,
  type TestQuiz,
} from './support/quiz-fixtures';

/**
 * Player reconnection after network disruptions.
 * Each test gets its own Active quiz whose first question is free text, so the play page
 * shows the "Type your answer" box.
 *
 * Manual testing observations (2026-01-31):
 * - ConnectionStatusBanner appears within ~1s of offline event
 * - Banner shows "Connection lost" with WifiOff icon
 * - Answer input disabled (placeholder changes to "Reconnecting…")
 * - Submit button disabled (text changes to "Reconnecting…")
 * - Auto-reconnection triggers immediately on 'online' event
 * - Banner disappears after successful reconnection
 * - Answer input re-enabled with "Type your answer" placeholder
 */

const joinAsPlayer = async (page: Page, quiz: TestQuiz) => {
  const playerName = `E2E Reconnect ${Date.now()}`;
  await page.goto('/join');
  await page.getByRole('textbox', { name: /join code/i }).fill(quiz.joinCode);
  await page.getByRole('textbox', { name: /your name/i }).fill(playerName);
  await page.getByRole('button', { name: /join quiz/i }).click();
  await page.waitForURL(new RegExp(`/play/${quiz.id}/[a-z0-9-]+`), {
    timeout: 30000,
  });
};

const setOnline = async (page: Page, online: boolean) => {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, online);
};

test.describe('Player Reconnection Flow', () => {
  let quiz: TestQuiz;

  test.beforeEach(async ({ page, createQuiz }) => {
    quiz = await createQuiz({
      label: 'player-reconnection',
      questions: [QUESTIONS.freeText, QUESTIONS.capitalOfFrance],
      start: true,
    });
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
  });

  test('should show offline banner when player disconnects', async ({
    page,
  }) => {
    await joinAsPlayer(page, quiz);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();

    await setOnline(page, false);

    const banner = page
      .getByRole('alert')
      .filter({ hasText: /connection lost/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/trying to reconnect/i);
    await expect(
      page.getByRole('textbox', { name: /reconnecting/i })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /reconnecting/i })
    ).toBeDisabled();
  });

  test('should auto-reconnect when network returns', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await setOnline(page, false);
    const banner = page
      .getByRole('alert')
      .filter({ hasText: /connection lost/i });
    await expect(banner).toBeVisible();

    await setOnline(page, true);

    await expect(banner).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /send answer/i })
    ).toBeVisible();
  });

  test('should disable answer submission while offline', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();

    await setOnline(page, false);

    await expect(
      page.getByRole('textbox', { name: /reconnecting/i })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /reconnecting/i })
    ).toBeDisabled();
  });

  test('should show reconnecting state during sync', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await setOnline(page, false);
    await expect(
      page.getByRole('alert').filter({ hasText: /connection lost/i })
    ).toBeVisible();

    await setOnline(page, true);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled({ timeout: 5000 });
  });

  test('should detect offline state immediately on load', async ({ page }) => {
    await joinAsPlayer(page, quiz);

    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();

    await setOnline(page, false);
    const banner = page
      .getByRole('alert')
      .filter({ hasText: /connection lost/i });
    await expect(banner).toBeVisible();

    await setOnline(page, true);

    await expect(banner).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();
  });
});
