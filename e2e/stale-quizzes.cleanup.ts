/**
 * Deletes fixture quizzes and sign-up users left behind by crashed runs (older than 30 minutes).
 */

import { test as cleanup } from '@playwright/test';
import { createAdminApi, sweepFixtureQuizzes } from './support/quiz-fixtures';
import { sweepSignupUsers } from './support/email-sign-in';

cleanup('delete stale fixture quizzes', async () => {
  const api = await createAdminApi();
  try {
    const deleted = await sweepFixtureQuizzes(api);
    console.log(`[CLEANUP] deleted ${deleted} stale fixture quizzes`);
  } finally {
    await api.dispose();
  }
});

cleanup('delete stale sign-up users', async () => {
  const deleted = await sweepSignupUsers();
  console.log(`[CLEANUP] deleted ${deleted} stale sign-up users`);
});
