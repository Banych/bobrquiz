import type { Page } from '@playwright/test';
import { test, expect } from './support/quiz-fixtures';
import { AdminQuizDetailPage, AdminQuizzesPage } from './pages';

/**
 * The per-host caps (issue 167) as the host sees them. Reaching a cap for
 * real takes 100 quizzes or questions, so the create request is answered with
 * the route's 400 instead; the unit tests cover the cap itself.
 */

const QUIZ_CAP_MESSAGE =
  'Limit reached: a host can have at most 100 quizzes. Delete one to create another.';
const QUESTION_CAP_MESSAGE =
  'Limit reached: a quiz can have at most 100 questions. Delete one to add another.';

/** Answers only the POST to `url` with the cap's 400; other requests go through. */
async function refuseCreate(page: Page, url: string, message: string) {
  await page.route(url, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    });
  });
}

test.describe('Per-host limits', () => {
  test('the create-quiz dialog shows the quiz cap message', async ({
    page,
  }) => {
    await refuseCreate(page, '**/api/admin/quizzes', QUIZ_CAP_MESSAGE);
    const quizzesPage = new AdminQuizzesPage(page);
    await quizzesPage.goto();

    await quizzesPage.createQuizButton.click();
    await expect(quizzesPage.createDialog).toBeVisible();
    await quizzesPage.createDialog
      .getByLabel(/quiz title/i)
      .fill('One quiz too many');
    await quizzesPage.createDialog
      .getByRole('button', { name: /^create quiz$/i })
      .click();

    await expect(quizzesPage.createDialog).toContainText(QUIZ_CAP_MESSAGE);
    await expect(quizzesPage.createDialog).toBeVisible();

    // Reopened after cancelling, the dialog starts without the old error
    await quizzesPage.createDialog
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(quizzesPage.createDialog).not.toBeVisible();
    await quizzesPage.createQuizButton.click();
    await expect(quizzesPage.createDialog).toBeVisible();
    await expect(quizzesPage.createDialog).not.toContainText(QUIZ_CAP_MESSAGE);
  });

  test('the create-question dialog shows the question cap message', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({ label: 'admin-limits', questions: [] });
    await refuseCreate(
      page,
      `**/api/admin/quizzes/${quiz.id}/questions`,
      QUESTION_CAP_MESSAGE
    );
    const detailPage = new AdminQuizDetailPage(page);
    await detailPage.goto(quiz.id);

    await detailPage.addQuestionButton.click();
    const dialog = detailPage.createQuestionDialog;
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('textbox', { name: 'Question *' })
      .fill('One question too many');
    await dialog.getByRole('textbox', { name: 'Option 1' }).fill('A');
    await dialog.getByRole('textbox', { name: 'Option 2' }).fill('B');
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: 'Create Question' }).click();

    await expect(dialog).toContainText(QUESTION_CAP_MESSAGE);
    await expect(dialog).toBeVisible();

    // Reopened after cancelling, the dialog starts without the old error
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await detailPage.addQuestionButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText(QUESTION_CAP_MESSAGE);
  });
});
