import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Admin Quiz Detail page
 * Encapsulates selectors and actions for /admin/quizzes/[id]
 */
export class AdminQuizDetailPage {
  readonly page: Page;

  // Header elements
  readonly logoutButton: Locator;

  // Page elements
  readonly addQuestionButton: Locator;
  readonly questionsTable: Locator;

  // Dialog elements
  readonly createQuestionDialog: Locator;
  readonly editQuestionDialog: Locator;
  readonly deleteQuestionDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.logoutButton = page.getByRole('button', { name: /logout/i });

    // Page
    this.addQuestionButton = page.getByRole('button', { name: 'Add Question' });
    this.questionsTable = page.getByRole('table');

    // Dialogs
    this.createQuestionDialog = page.getByRole('dialog', {
      name: 'Create Question',
    });
    this.editQuestionDialog = page.getByRole('dialog', {
      name: 'Edit Question',
    });
    this.deleteQuestionDialog = page.getByRole('dialog', {
      name: 'Delete Question',
    });
  }

  /**
   * Navigate to quiz detail page
   */
  async goto(quizId: string) {
    await this.page.goto(`http://localhost:3000/admin/quizzes/${quizId}`);
    await this.waitForLoad();
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForLoad() {
    await expect(this.addQuestionButton).toBeVisible({ timeout: 5000 });
  }

  /**
   * Get a question row by question text
   */
  getQuestionRow(questionText: string) {
    return this.page.getByRole('row').filter({ hasText: questionText });
  }

  /**
   * Check if a question exists in the table
   */
  async hasQuestion(questionText: string): Promise<boolean> {
    return await this.page
      .getByRole('cell', { name: questionText })
      .isVisible();
  }

  /**
   * Create a multiple-choice question
   */
  async createMultipleChoiceQuestion(options: {
    question: string;
    options: string[];
    correctIndexes: number[];
    points?: number;
  }) {
    // Open create dialog
    await this.addQuestionButton.click();
    await expect(this.createQuestionDialog).toBeVisible();

    // Fill question text
    await this.createQuestionDialog
      .getByRole('textbox', { name: 'Question *' })
      .fill(options.question);

    // Fill options
    for (let i = 0; i < options.options.length; i++) {
      await this.createQuestionDialog
        .getByRole('textbox', { name: `Option ${i + 1}` })
        .fill(options.options[i]);
    }

    // Mark correct answers
    for (const index of options.correctIndexes) {
      await this.createQuestionDialog.getByRole('checkbox').nth(index).check();
    }

    // Set custom points if provided
    if (options.points) {
      await this.createQuestionDialog
        .getByRole('spinbutton', { name: /points/i })
        .fill(String(options.points));
    }

    // Submit
    await this.createQuestionDialog
      .getByRole('button', { name: 'Create Question' })
      .click();

    // Wait for dialog to close
    await expect(this.createQuestionDialog).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Edit a question
   */
  async editQuestion(
    currentText: string,
    updates: {
      question?: string;
      options?: string[];
      correctIndexes?: number[];
    }
  ) {
    // Find and click the row's edit button
    const row = this.getQuestionRow(currentText);
    const editButton = row.getByRole('button', {
      name: 'Edit question',
      exact: true,
    });
    await editButton.click();

    // Wait for edit dialog and verify pre-filled data
    await expect(this.editQuestionDialog).toBeVisible();

    // Wait for form to load data (async operation)
    await expect(
      this.editQuestionDialog.getByRole('textbox', { name: 'Question *' })
    ).not.toBeEmpty({ timeout: 5000 });

    // Update fields
    if (updates.question) {
      const questionInput = this.editQuestionDialog.getByRole('textbox', {
        name: 'Question *',
      });
      // Select all and replace (avoids triggering form reset from clear())
      await questionInput.click({ clickCount: 3 });
      await questionInput.fill(updates.question);
    }

    if (updates.options) {
      for (let i = 0; i < updates.options.length; i++) {
        const optionInput = this.editQuestionDialog.getByRole('textbox', {
          name: `Option ${i + 1}`,
        });
        await optionInput.clear();
        await optionInput.fill(updates.options[i]);
      }
    }

    // Re-check correct answers if provided (needed after text changes)
    if (updates.correctIndexes) {
      for (const index of updates.correctIndexes) {
        const checkbox = this.editQuestionDialog
          .getByRole('checkbox')
          .nth(index);
        // Wait for checkbox to be enabled (form loads async)
        await checkbox.waitFor({ state: 'attached', timeout: 5000 });
        await expect(checkbox).toBeEnabled({ timeout: 5000 });
        // Only check if not already checked (avoids triggering form reset)
        if (!(await checkbox.isChecked())) {
          await checkbox.check();
        }
      }
    }

    // Submit
    await this.editQuestionDialog
      .getByRole('button', { name: 'Save Changes' })
      .click();
  }

  /**
   * Delete a question
   */
  async deleteQuestion(questionText: string) {
    // Find and click the row's delete button
    const row = this.getQuestionRow(questionText);
    const deleteButton = row.getByRole('button', {
      name: 'Delete question',
      exact: true,
    });
    await deleteButton.click();

    // Confirm deletion
    await expect(this.deleteQuestionDialog).toBeVisible();
    await this.deleteQuestionDialog
      .getByRole('button', { name: 'Delete Question' })
      .click();

    // Wait for dialog to close and question to be removed
    await expect(this.deleteQuestionDialog).not.toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByRole('cell', { name: questionText })
    ).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Cancel question creation
   */
  async cancelQuestionCreation() {
    await this.addQuestionButton.click();
    await expect(this.createQuestionDialog).toBeVisible();

    // Click cancel
    await this.createQuestionDialog
      .getByRole('button', { name: 'Cancel' })
      .click();

    // Verify dialog closed
    await expect(this.createQuestionDialog).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Validate that question field shows error when empty
   */
  async validateQuestionRequired(): Promise<boolean> {
    await this.addQuestionButton.click();
    await expect(this.createQuestionDialog).toBeVisible();

    // Fill options but not question
    await this.createQuestionDialog
      .getByRole('textbox', { name: 'Option 1' })
      .fill('Test');
    await this.createQuestionDialog.getByRole('checkbox').first().check();

    // Try to submit
    await this.createQuestionDialog
      .getByRole('button', { name: 'Create Question' })
      .click();

    // Check if dialog is still visible (validation failed)
    const isVisible = await this.createQuestionDialog.isVisible();

    // Close dialog
    if (isVisible) {
      await this.page.keyboard.press('Escape');
    }

    return isVisible;
  }

  /**
   * Get question number from the table
   */
  async getQuestionNumber(questionText: string): Promise<string> {
    const row = this.getQuestionRow(questionText);
    // First cell is drag handle, second cell is the number
    const numberCell = row.locator('td').nth(1);
    return (await numberCell.textContent()) || '';
  }

  /**
   * Get question type from the table
   */
  async getQuestionType(questionText: string): Promise<string> {
    const row = this.getQuestionRow(questionText);
    const typeCell = row.getByRole('cell', {
      name: /multiple-choice|true-false/i,
    });
    return (await typeCell.textContent()) || '';
  }

  /**
   * Check if option checkbox is enabled
   */
  async isOptionCheckboxEnabled(optionNumber: number): Promise<boolean> {
    const checkbox = this.createQuestionDialog
      .getByRole('checkbox')
      .nth(optionNumber - 1);
    return await checkbox.isEnabled();
  }
}
