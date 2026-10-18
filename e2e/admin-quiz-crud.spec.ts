import {
  test,
  expect,
  QUESTIONS,
  FIXTURE_TITLE_PREFIX,
} from './support/quiz-fixtures';
import { AdminQuizzesPage } from './pages';

test.describe('Admin Quiz CRUD', () => {
  let quizzesPage: AdminQuizzesPage;

  // Force serial execution to avoid auth conflicts between tests
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    // Create a persistent context with auth state for all tests
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();
    quizzesPage = new AdminQuizzesPage(page);
    await quizzesPage.goto();
  });

  test('should create a new quiz', async () => {
    const title = `${FIXTURE_TITLE_PREFIX}admin-quiz-crud ${Date.now()}`;

    // Create quiz using page object
    await quizzesPage.createQuiz({
      title,
      timePerQuestion: 45,
      allowSkipping: true,
    });

    // Verify quiz appears with correct status
    await expect(
      quizzesPage.page.getByRole('cell', { name: title })
    ).toBeVisible({ timeout: 10000 });

    const row = quizzesPage.getQuizRow(title);
    await expect(row.getByText(/pending/i)).toBeVisible();

    // Verify action buttons are visible for Pending quiz
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('should update a pending quiz', async () => {
    // Both titles end in a timestamp so the sweep can age them
    const stamp = Date.now();
    const originalTitle = `${FIXTURE_TITLE_PREFIX}admin-quiz-update ${stamp}`;
    const updatedTitle = `${FIXTURE_TITLE_PREFIX}admin-quiz-updated ${stamp}`;

    // Create a quiz to update
    await quizzesPage.createQuiz({ title: originalTitle });

    // Edit the quiz
    await quizzesPage.editQuiz(originalTitle, {
      title: updatedTitle,
      timePerQuestion: 60,
    });

    // Verify updated title appears
    await expect(
      quizzesPage.page.getByRole('cell', { name: updatedTitle })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should delete a pending quiz', async () => {
    const title = `${FIXTURE_TITLE_PREFIX}admin-quiz-delete ${Date.now()}`;

    // Create a quiz to delete
    await quizzesPage.createQuiz({ title });

    // Delete the quiz
    await quizzesPage.deleteQuiz(title);

    // Verify quiz is removed
    await expect(
      quizzesPage.page.getByRole('cell', { name: title })
    ).not.toBeVisible({ timeout: 10000 });
  });

  test('should not show edit/delete buttons for active quiz', async ({
    createQuiz,
  }) => {
    const quiz = await createQuiz({
      label: 'admin-quiz-list',
      questions: [QUESTIONS.capitalOfFrance],
      start: true,
    });
    await quizzesPage.goto();

    const row = quizzesPage.getQuizRow(quiz.title);
    await expect(row.getByText('Active', { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // Only Pending quizzes have Edit and Delete buttons
    expect(await quizzesPage.hasEditButton(quiz.title)).toBe(false);
    await expect(row.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });
});
