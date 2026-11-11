import 'dotenv/config';

import { prisma } from '@infrastructure/database/prisma/client';

import { assignQuizOwner } from './assign-quiz-owner-core';

const main = async () => {
  const { updated, remaining } = await assignQuizOwner(prisma, process.argv[2]);
  console.info(`Assigned an owner to ${updated} quiz(zes).`);
  console.info(`Quizzes still without an owner: ${remaining}.`);
};

main()
  .catch((error) => {
    console.error(
      'Quiz owner backfill failed:',
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
