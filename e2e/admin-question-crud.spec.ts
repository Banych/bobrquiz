import { test, expect } from './support/quiz-fixtures';
import { AdminQuizDetailPage } from './pages';

test.describe('Admin Question CRUD', () => {
  let quizId: string;
  let detailPage: AdminQuizDetailPage;

  test.beforeEach(async ({ page, createQuiz }) => {
    const quiz = await createQuiz({
      label: 'admin-question-crud',
      questions: [],
    });
    quizId = quiz.id;

    detailPage = new AdminQuizDetailPage(page);
    await detailPage.goto(quizId);
  });

  test('should create a multiple-choice question', async ({ page }) => {
    await detailPage.createMultipleChoiceQuestion({
      question: 'What is 2 + 2?',
      options: ['3', '4', '5'],
      correctIndexes: [1], // Option 2 is correct
    });

    // Verify question appears in table
    await expect(
      page.getByRole('cell', { name: 'What is 2 + 2?' })
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'multiple-choice' })
    ).toBeVisible();
  });

  test('should edit a question', async ({ page }) => {
    // First create a question
    await detailPage.createMultipleChoiceQuestion({
      question: 'Original Question',
      options: ['A', 'B'],
      correctIndexes: [0],
    });

    // Edit the question
    await detailPage.editQuestion('Original Question', {
      question: 'Updated Question',
      correctIndexes: [0], // Re-specify correct answer (required after text change)
    });

    // Wait for dialog to close
    await expect(detailPage.editQuestionDialog).not.toBeVisible();

    // Verify changes reflected in table
    await expect(
      page.getByRole('cell', { name: 'Updated Question' })
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Original Question' })
    ).not.toBeVisible();
  });

  test('should delete a question', async ({ page }) => {
    // First create a question
    await detailPage.createMultipleChoiceQuestion({
      question: 'Question to Delete',
      options: ['A', 'B'],
      correctIndexes: [0],
    });

    // Delete the question
    await detailPage.deleteQuestion('Question to Delete');

    // Verify question removed
    await expect(
      page.getByRole('cell', { name: 'Question to Delete' })
    ).not.toBeVisible();
  });

  test('should validate required fields', async () => {
    // Validate using page object
    const isStillVisible = await detailPage.validateQuestionRequired();

    // Dialog should still be visible (validation failed)
    expect(isStillVisible).toBe(true);
  });

  test('should cancel question creation', async ({ page }) => {
    await detailPage.cancelQuestionCreation();

    // Question should not appear in table
    await expect(
      page.getByRole('cell', { name: 'Test Question' })
    ).not.toBeVisible();
  });

  test('should display correct question numbering', async () => {
    // Create two questions
    await detailPage.createMultipleChoiceQuestion({
      question: 'Question 1',
      options: ['A', 'B'],
      correctIndexes: [0],
    });

    await detailPage.createMultipleChoiceQuestion({
      question: 'Question 2',
      options: ['C', 'D'],
      correctIndexes: [0],
    });

    // Verify numbering
    const q1Number = await detailPage.getQuestionNumber('Question 1');
    const q2Number = await detailPage.getQuestionNumber('Question 2');

    expect(q1Number).toContain('1');
    expect(q2Number).toContain('2');
  });

  test('should create question with custom points', async ({ page }) => {
    await detailPage.createMultipleChoiceQuestion({
      question: 'Hard Question',
      options: ['A', 'B'],
      correctIndexes: [0],
      points: 25,
    });

    // Verify custom points displayed
    const row = page.getByRole('row').filter({ hasText: 'Hard Question' });
    await expect(row.getByRole('cell', { name: '25' })).toBeVisible();
  });

  test('should enable checkboxes only when options have text', async () => {
    // Open create dialog
    await detailPage.addQuestionButton.click();
    await expect(detailPage.createQuestionDialog).toBeVisible();

    // Initially checkbox 1 should be disabled
    expect(await detailPage.isOptionCheckboxEnabled(1)).toBe(false);

    // Fill option 1
    await detailPage.createQuestionDialog
      .getByRole('textbox', { name: 'Option 1' })
      .fill('A');

    // Checkbox 1 should now be enabled
    expect(await detailPage.isOptionCheckboxEnabled(1)).toBe(true);

    // Checkbox 2 should still be disabled
    expect(await detailPage.isOptionCheckboxEnabled(2)).toBe(false);

    // Fill option 2
    await detailPage.createQuestionDialog
      .getByRole('textbox', { name: 'Option 2' })
      .fill('B');

    // Checkbox 2 should now be enabled
    expect(await detailPage.isOptionCheckboxEnabled(2)).toBe(true);
  });
});
