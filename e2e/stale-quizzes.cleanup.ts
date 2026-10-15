/**
 * Deletes fixture quizzes left behind by crashed runs (older than 30 minutes).
 */

import { test as cleanup } from '@playwright/test';
import { createAdminApi, sweepFixtureQuizzes } from './support/quiz-fixtures';

cleanup('delete stale fixture quizzes', async () => {
  const api = await createAdminApi();
  try {
    const deleted = await sweepFixtureQuizzes(api);
    console.log(`[CLEANUP] deleted ${deleted} stale fixture quizzes`);
  } finally {
    await api.dispose();
  }
});
