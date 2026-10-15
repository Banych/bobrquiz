'use client';

import Image from 'next/image';
import type { QuestionListItemDTO } from '@application/dtos/question-admin.dto';
import { DeleteQuestionDialog } from '@components/admin/delete-question-dialog';
import { EditQuestionDialog } from '@components/admin/edit-question-dialog';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@ui/badge';
import { Button } from '@ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/table';
import { GripVertical, Pencil, Trash2, ImageIcon } from 'lucide-react';
import { useState } from 'react';

interface QuestionListProps {
  quizId: string;
}

export function QuestionList({ quizId }: QuestionListProps) {
  const [editingQuestion, setEditingQuestion] =
    useState<QuestionListItemDTO | null>(null);
  const [deletingQuestion, setDeletingQuestion] =
    useState<QuestionListItemDTO | null>(null);

  const { data: questions = [], isLoading } = useQuery<QuestionListItemDTO[]>({
    queryKey: ['questions', quizId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/quizzes/${quizId}/questions`);
      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="animate-pulse">Loading questions...</div>;
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <h3 className="text-lg font-semibold">No questions yet</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Add your first question to get started
        </p>
      </div>
    );
  }

  const getTypeBadgeColor = (type: QuestionListItemDTO['type']) => {
    switch (type) {
      case 'multiple-choice':
        return 'default';
      case 'true/false':
        return 'secondary';
      case 'text':
        return 'outline';
    }
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-16">Media</TableHead>
              <TableHead>Question</TableHead>
              <TableHead className="w-32">Type</TableHead>
              <TableHead className="w-20">Points</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((question) => (
              <TableRow key={question.id}>
                <TableCell>
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                </TableCell>
                <TableCell className="font-medium">
                  {question.orderIndex + 1}
                </TableCell>
                <TableCell>
                  {question.mediaUrl ? (
                    <div className="relative h-10 w-10 rounded overflow-hidden bg-muted">
                      <Image
                        src={question.mediaUrl}
                        alt="Question thumbnail"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-2">{question.text}</span>
                    {!question.hasCorrectAnswers && (
                      <Badge variant="destructive" className="text-xs">
                        No answer
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeBadgeColor(question.type)}>
                    {question.type}
                  </Badge>
                </TableCell>
                <TableCell>{question.points}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit question"
                      onClick={() => setEditingQuestion(question)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete question"
                      onClick={() => setDeletingQuestion(question)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingQuestion && (
        <EditQuestionDialog
          quizId={quizId}
          question={editingQuestion}
          open={!!editingQuestion}
          onOpenChange={(open) => !open && setEditingQuestion(null)}
        />
      )}

      {deletingQuestion && (
        <DeleteQuestionDialog
          quizId={quizId}
          question={deletingQuestion}
          open={!!deletingQuestion}
          onOpenChange={(open) => !open && setDeletingQuestion(null)}
        />
      )}
    </>
  );
}
