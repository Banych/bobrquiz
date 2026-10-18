import type { Page } from '@playwright/test';
import {
  test,
  expect,
  QUESTIONS,
  type TestQuiz,
} from './support/quiz-fixtures';
import { joinAsPlayer } from './support/player-join';

/**
 * Player reconnection after network disruptions.
 * Each test gets its own Active quiz whose first question is free text, so the play page
 * shows the "Type your answer" box. The network is faked through navigator.onLine and window
 * events; the realtime socket and fetches stay up, so no real resubscribe is exercised.
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

const setOnline = async (page: Page, online: boolean) => {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }, online);
};

test.describe('Player Reconnection Flow', () => {
  let quiz: TestQuiz;

  test.beforeEach(async ({ createQuiz }) => {
    quiz = await createQuiz({
      label: 'player-reconnection',
      questions: [QUESTIONS.freeText, QUESTIONS.capitalOfFrance],
      start: true,
    });
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

  test('should clear the banner and re-enable answering when the network returns', async ({
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

    await setOnline(page, true);

    await expect(banner).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('textbox', { name: /type your answer/i })
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /send answer/i })
    ).toBeVisible();
  });
});
