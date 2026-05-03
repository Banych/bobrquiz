'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QuestionList } from '@components/admin/question-list';
import { CreateQuestionDialog } from '@components/admin/create-question-dialog';
import { Button } from '@ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/card';
import { ArrowLeft, LayoutDashboard, MonitorPlay } from 'lucide-react';
import Link from 'next/link';
import type { QuizDTO } from '@application/dtos/quiz.dto';

export default function QuizDetailPage() {
  const params = useParams();
  const quizId = params.quizId as string;

  const { data: quiz, isLoading } = useQuery<QuizDTO>({
    queryKey: ['quiz', quizId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/quizzes/${quizId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quiz');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse">Loading quiz...</div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-destructive">Quiz not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/quizzes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{quiz.title}</h1>
          <p className="text-muted-foreground">
            Manage questions for this quiz
          </p>
        </div>
        <Button variant="default" asChild>
          <Link href={`/quiz/${quizId}`}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Open Dashboard
          </Link>
        </Button>
        {quiz.status === 'Active' && (
          <Button variant="outline" asChild>
            <Link href={`/quiz/${quizId}/live`}>
              <MonitorPlay className="mr-2 h-4 w-4" />
              Open Live View
            </Link>
          </Button>
        )}
        <CreateQuestionDialog quizId={quizId} />
      </div>

      {/* Quiz metadata */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quiz.questions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Timer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {quiz.settings.timePerQuestion}s
            </div>
            <CardDescription>per question</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quiz.status}</div>
          </CardContent>
        </Card>
      </div>

      {/* Question list */}
      <QuestionList quizId={quizId} />
    </div>
  );
}
