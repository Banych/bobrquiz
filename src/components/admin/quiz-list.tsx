'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Pencil, Trash2, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EditQuizDialog } from './edit-quiz-dialog';
import { DeleteQuizDialog } from './delete-quiz-dialog';
import type { QuizListItemDTO } from '@application/dtos/quiz-admin.dto';

export function QuizList() {
  const router = useRouter();
  const [editingQuiz, setEditingQuiz] = useState<QuizListItemDTO | null>(null);
  const [deletingQuiz, setDeletingQuiz] = useState<QuizListItemDTO | null>(
    null
  );

  const {
    data: quizzes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin', 'quizzes'],
    queryFn: async () => {
      const res = await fetch('/api/admin/quizzes');
      if (!res.ok) throw new Error('Failed to fetch quizzes');
      return res.json() as Promise<QuizListItemDTO[]>;
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Loading quizzes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-sm text-destructive">
        Failed to load quizzes. Please try again.
      </div>
    );
  }

  if (!quizzes || quizzes.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No quizzes yet. Create your first quiz to get started!
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Questions</TableHead>
            <TableHead className="hidden sm:table-cell">Players</TableHead>
            <TableHead className="hidden sm:table-cell">
              Time/Question
            </TableHead>
            <TableHead>Join Code</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quizzes.map((quiz) => (
            <TableRow key={quiz.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/admin/quizzes/${quiz.id}`}
                  className="hover:underline"
                >
                  {quiz.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    quiz.status === 'Active'
                      ? 'default'
                      : quiz.status === 'Completed'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {quiz.status}
                </Badge>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {quiz.questionCount}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {quiz.playerCount}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {quiz.timePerQuestion}s
              </TableCell>
              <TableCell>
                {quiz.joinCode ? (
                  <code className="text-sm">{quiz.joinCode}</code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Open Dashboard"
                  aria-label="Open dashboard"
                  onClick={() => router.push(`/quiz/${quiz.id}`)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
                {quiz.status === 'Pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Edit"
                    aria-label="Edit quiz"
                    onClick={() => setEditingQuiz(quiz)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {quiz.status === 'Pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Open Lobby"
                    aria-label="Open lobby"
                    onClick={() => router.push(`/quiz/${quiz.id}/live`)}
                  >
                    <MonitorPlay className="h-4 w-4" />
                  </Button>
                )}
                {quiz.status === 'Active' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Open Live View"
                    aria-label="Open live view"
                    onClick={() => router.push(`/quiz/${quiz.id}/live`)}
                  >
                    <MonitorPlay className="h-4 w-4" />
                  </Button>
                )}
                {quiz.status !== 'Active' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Delete"
                    aria-label="Delete quiz"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeletingQuiz(quiz)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingQuiz && (
        <EditQuizDialog
          open={!!editingQuiz}
          onOpenChange={(open) => !open && setEditingQuiz(null)}
          quiz={editingQuiz}
        />
      )}

      {deletingQuiz && (
        <DeleteQuizDialog
          open={!!deletingQuiz}
          onOpenChange={(open) => !open && setDeletingQuiz(null)}
          quiz={deletingQuiz}
        />
      )}
    </div>
  );
}
