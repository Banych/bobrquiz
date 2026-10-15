import { getServices } from '@application/services/factories';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { QuizListItemDTO } from '@application/dtos/quiz-admin.dto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Host a Quiz — Bobr Quiz',
  description: 'Pick a quiz and start a live session.',
};

export default async function HostPage() {
  const { quizService } = getServices();
  const quizzes = await quizService.listAllQuizzes();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Select a Quiz to Host</h1>
      {quizzes.length === 0 ? (
        <p className="text-muted-foreground">
          No quizzes found. Create one in the admin area.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz: QuizListItemDTO) => (
            <Card key={quiz.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {quiz.title}
                  <Badge
                    variant={quiz.status === 'Active' ? 'default' : 'secondary'}
                  >
                    {quiz.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  {quiz.questionCount} questions · {quiz.playerCount} players
                </p>
                {quiz.joinCode && (
                  <p>
                    Join code:{' '}
                    <span className="font-mono font-semibold">
                      {quiz.joinCode}
                    </span>
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/quiz/${quiz.id}`}>Dashboard</Link>
                </Button>
                {quiz.status === 'Active' && (
                  <Button asChild size="sm">
                    <Link href={`/quiz/${quiz.id}/live`}>Live View</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
