import 'dotenv/config';
import { prisma } from '@infrastructure/database/prisma/client';
import { seedLaunchDemoQuiz } from '@infrastructure/database/prisma/seed-helpers';

const main = async () => {
  console.info('Seeding launch demo quiz...');
  const { quiz, questions } = await seedLaunchDemoQuiz();

  console.info(
    `Demo quiz "${quiz.title}" ready with join code ${quiz.joinCode} and ${questions.length} questions.`
  );
};

main()
  .catch((error) => {
    console.error('Launch demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
