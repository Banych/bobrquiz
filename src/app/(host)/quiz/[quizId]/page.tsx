import { notFound } from 'next/navigation';
import { getServices } from '@application/services/factories';
import { getCurrentUserId } from '@infrastructure/auth/get-current-user';
import { HostQuizDashboard } from '@/components/host/host-quiz-dashboard';

export const dynamic = 'force-dynamic';

type HostQuizPageProps = {
  params: Promise<{ quizId: string }>;
};

export default async function HostQuizPage({ params }: HostQuizPageProps) {
  const { quizId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) {
    notFound();
  }

  const { quizService } = getServices();

  try {
    // Someone else's quiz shows the same not-found page as a missing one
    await quizService.assertQuizOwner(quizId, userId);
    const quiz = await quizService.getQuizState(quizId);
    return <HostQuizDashboard quizId={quizId} initialQuiz={quiz} />;
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      notFound();
    }

    throw error;
  }
}
