'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScoringSettings } from '@/components/admin/scoring-settings';
import type { CreateQuizDTO } from '@application/dtos/quiz-admin.dto';
import type { ScoringAlgorithmType } from '@lib/scoring-preview';

type CreateQuizDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateQuizDialog({
  open,
  onOpenChange,
}: CreateQuizDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [allowSkipping, setAllowSkipping] = useState(false);
  const [scoringAlgorithm, setScoringAlgorithm] =
    useState<ScoringAlgorithmType>('EXPONENTIAL_DECAY');
  const [scoringDecayRate, setScoringDecayRate] = useState<number | undefined>(
    2.0
  );

  const createMutation = useMutation({
    mutationFn: async (data: CreateQuizDTO) => {
      const res = await fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create quiz');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
      setTitle('');
      setTimePerQuestion(30);
      setAllowSkipping(false);
      setScoringAlgorithm('EXPONENTIAL_DECAY');
      setScoringDecayRate(2.0);
      onOpenChange(false);
    },
  });

  // A closed dialog drops the last error, so reopening starts clean
  const handleOpenChange = (next: boolean) => {
    if (!next) createMutation.reset();
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      timePerQuestion,
      allowSkipping,
      scoringAlgorithm,
      scoringDecayRate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Quiz</DialogTitle>
          <DialogDescription>
            Create a new quiz. You can add questions after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Quiz Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter quiz title"
              required
              disabled={createMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timePerQuestion">Time Per Question (seconds)</Label>
            <Input
              id="timePerQuestion"
              type="number"
              min={5}
              max={300}
              value={timePerQuestion}
              onChange={(e) => setTimePerQuestion(Number(e.target.value))}
              required
              disabled={createMutation.isPending}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="allowSkipping"
              checked={allowSkipping}
              onCheckedChange={(checked) => setAllowSkipping(checked === true)}
              disabled={createMutation.isPending}
            />
            <Label htmlFor="allowSkipping" className="font-normal">
              Allow players to skip questions
            </Label>
          </div>

          <ScoringSettings
            timePerQuestion={timePerQuestion}
            scoringAlgorithm={scoringAlgorithm}
            scoringDecayRate={scoringDecayRate}
            onScoringAlgorithmChange={setScoringAlgorithm}
            onScoringDecayRateChange={setScoringDecayRate}
            disabled={createMutation.isPending}
          />

          {createMutation.isError && (
            <p className="text-sm text-destructive">
              {createMutation.error.message}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Quiz'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
