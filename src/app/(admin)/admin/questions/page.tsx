'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AllQuestionsView } from '@/components/admin/all-questions-view';

export default function AdminQuestionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Questions</h1>
        <p className="text-muted-foreground">
          Browse and manage questions across your quizzes
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Questions</CardTitle>
          <CardDescription>
            Filter by quiz or manage individual questions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AllQuestionsView />
        </CardContent>
      </Card>
    </div>
  );
}
