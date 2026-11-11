import { prisma } from '@infrastructure/database/prisma/client';
import {
  requireSeedQuizOwnerId,
  resetDatabase,
  seedDemoQuiz,
} from '@infrastructure/database/prisma/seed-helpers';

const main = async () => {
  requireSeedQuizOwnerId();
  console.info('Seeding Prisma database with demo data...');
  await resetDatabase();
  const { quiz, questions, players } = await seedDemoQuiz();

  console.info(
    `Seeded quiz ${quiz.id} with ${questions.length} questions and ${players.length} players.`
  );
};

main()
  .catch((error) => {
    console.error('Prisma seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
