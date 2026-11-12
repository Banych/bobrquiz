import { test, expect } from './support/quiz-fixtures';
import { AdminQuizDetailPage } from './pages';

/** A 1×1 PNG; the browser re-encodes it as JPEG before upload. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Admin media', () => {
  test('owner uploads a question image, then lists and deletes it in the library', async ({
    page,
    createQuiz,
  }) => {
    const quiz = await createQuiz({ label: 'admin-media', questions: [] });
    const detailPage = new AdminQuizDetailPage(page);
    await detailPage.goto(quiz.id);

    await detailPage.addQuestionButton.click();
    const dialog = detailPage.createQuestionDialog;
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('textbox', { name: 'Question *' })
      .fill('Which picture?');
    await dialog.getByRole('textbox', { name: 'Option 1' }).fill('This one');
    await dialog.getByRole('textbox', { name: 'Option 2' }).fill('That one');
    await dialog.getByRole('checkbox').nth(0).check();

    // The upload goes to the owner-checked route, not to Supabase Storage.
    const uploadResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/admin/quizzes/${quiz.id}/media`) &&
        response.request().method() === 'POST'
    );
    const fileChooser = page.waitForEvent('filechooser');
    await dialog.getByText('Click to upload or drag and drop').click();
    await (
      await fileChooser
    ).setFiles({
      name: 'e2e-media.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    const response = await uploadResponse;
    expect(response.status()).toBe(201);
    const uploaded = (await response.json()) as { name: string; path: string };
    expect(uploaded.path).toBe(`questions/${quiz.id}/${uploaded.name}`);
    await expect(
      dialog.getByRole('button', { name: 'Remove image' })
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Create Question' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole('cell', { name: 'Which picture?' })
    ).toBeVisible();

    // The library lists the file under its quiz and deletes it.
    await page.goto('/admin/media');
    const deleteButton = page.getByRole('button', {
      name: `Delete ${uploaded.name}`,
    });
    await expect(deleteButton).toBeVisible();
    const card = page.locator('div.group').filter({ has: deleteButton });
    await expect(card).toContainText(quiz.title);

    const deleteResponse = page.waitForResponse(
      (r) =>
        r
          .url()
          .endsWith(`/api/admin/quizzes/${quiz.id}/media/${uploaded.name}`) &&
        r.request().method() === 'DELETE'
    );
    page.once('dialog', (confirmDialog) => void confirmDialog.accept());
    await card.hover();
    await deleteButton.click();
    expect((await deleteResponse).status()).toBe(200);
    await expect(deleteButton).not.toBeVisible();
  });
});
