import type { Page, Response } from '@playwright/test';
import type { TestQuiz } from './quiz-fixtures';

const isJoinRequest = (response: Response) =>
  response.url().endsWith('/api/session/join') &&
  response.request().method() === 'POST';

/** Fills and submits the join form; resolves with the join API's response. */
export async function submitJoinForm(
  page: Page,
  joinCode: string,
  playerName: string
): Promise<Response> {
  await page.goto('/join');
  await page.getByRole('textbox', { name: /join code/i }).fill(joinCode);
  await page.getByRole('textbox', { name: /your name/i }).fill(playerName);
  const [response] = await Promise.all([
    page.waitForResponse(isJoinRequest, { timeout: 30_000 }),
    page.getByRole('button', { name: /join quiz/i }).click(),
  ]);
  return response;
}

/**
 * Joins the quiz as a new player and waits for the play page. A refused join (a 429 from the
 * rate limit, a 500 from a bad env value) fails here with its status and body.
 */
export async function joinAsPlayer(
  page: Page,
  quiz: TestQuiz,
  playerName = `E2E Player ${Date.now()}`
): Promise<string> {
  const response = await submitJoinForm(page, quiz.joinCode, playerName);
  if (response.status() !== 200) {
    throw new Error(
      `POST /api/session/join failed: ${response.status()} ${await response.text()}`
    );
  }
  await page.waitForURL(new RegExp(`/play/${quiz.id}/[a-z0-9-]+`), {
    timeout: 30_000,
  });
  return playerName;
}
