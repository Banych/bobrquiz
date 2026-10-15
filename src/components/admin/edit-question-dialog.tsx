'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/dialog';
import { Button } from '@ui/button';
import { Input } from '@ui/input';
import { Label } from '@ui/label';
import { Textarea } from '@ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/select';
import { Alert, AlertDescription } from '@ui/alert';
import { X, AlertTriangle } from 'lucide-react';
import { ImageUpload } from '@components/admin/image-upload';
import { createStorageService } from '@infrastructure/storage/supabase-storage';
import type {
  UpdateQuestionDTO,
  QuestionListItemDTO,
} from '@application/dtos/question-admin.dto';

interface EditQuestionDialogProps {
  quizId: string;
  question: QuestionListItemDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditQuestionDialog({
  quizId,
  question,
  open,
  onOpenChange,
}: EditQuestionDialogProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [type, setType] = useState<'multiple-choice' | 'text' | 'true/false'>(
    'multiple-choice'
  );
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]);
  const [points, setPoints] = useState(10);
  const [typeChanged, setTypeChanged] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const storageService = createStorageService();

  // Fetch full question details when dialog opens
  useEffect(() => {
    if (open && question) {
      // Pre-fill form with current values
      setText(question.text);
      setType(question.type);
      setPoints(question.points);
      setTypeChanged(false);

      // Fetch full question data including options and correctAnswers
      fetch(`/api/admin/quizzes/${quizId}/questions/${question.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.options) setOptions(data.options);
          if (data.correctAnswers) setCorrectAnswers(data.correctAnswers);
          if (data.mediaUrl) setMediaUrl(data.mediaUrl);
        })
        .catch(console.error);
    }
  }, [open, question, quizId]);

  const updateMutation = useMutation({
    mutationFn: async (dto: UpdateQuestionDTO) => {
      const response = await fetch(
        `/api/admin/quizzes/${quizId}/questions/${question.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dto),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update question');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', quizId] });
      onOpenChange(false);
    },
  });

  const handleSubmit = () => {
    if (!text.trim()) {
      alert('Please enter a question');
      return;
    }

    if (correctAnswers.length === 0) {
      alert('Please select at least one correct answer');
      return;
    }

    const dto: UpdateQuestionDTO = {
      text: text.trim(),
      type,
      options:
        type === 'multiple-choice' ? options.filter((o) => o.trim()) : [],
      correctAnswers,
      points,
      mediaUrl: mediaUrl || null,
      mediaType: mediaUrl ? 'image' : null,
    };

    updateMutation.mutate(dto);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    setCorrectAnswers(correctAnswers.filter((ans) => ans !== options[index]));
  };

  const toggleCorrectAnswer = (option: string) => {
    if (correctAnswers.includes(option)) {
      setCorrectAnswers(correctAnswers.filter((ans) => ans !== option));
    } else {
      setCorrectAnswers([...correctAnswers, option]);
    }
  };

  const handleTypeChange = (newType: typeof type) => {
    if (newType !== question.type) {
      setTypeChanged(true);
    }
    setType(newType);
    setCorrectAnswers([]);
    if (newType === 'true/false') {
      setOptions(['True', 'False']);
    } else if (newType === 'text') {
      setOptions([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Question</DialogTitle>
          <DialogDescription>
            Update the question details. Answers are validated
            case-insensitively and trimmed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {typeChanged && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Changing the question type will clear incompatible fields
                (options/correct answers). You&apos;ll need to re-enter them.
              </AlertDescription>
            </Alert>
          )}

          {/* Question Text */}
          <div>
            <Label htmlFor="edit-question-text">Question *</Label>
            <Textarea
              id="edit-question-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your question..."
              rows={3}
            />
          </div>

          {/* Question Type */}
          <div>
            <Label htmlFor="edit-question-type">Type *</Label>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger id="edit-question-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                <SelectItem value="true/false">True/False</SelectItem>
                <SelectItem value="text">Text Answer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Multiple Choice Options */}
          {type === 'multiple-choice' && (
            <div>
              <Label>Options * (check correct answers)</Label>
              <div className="space-y-2 mt-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={correctAnswers.includes(option)}
                      onChange={() => toggleCorrectAnswer(option)}
                      disabled={!option.trim()}
                      className="h-4 w-4"
                    />
                    <Input
                      value={option}
                      onChange={(e) =>
                        handleOptionChange(index, e.target.value)
                      }
                      placeholder={`Option ${index + 1}`}
                    />
                    {options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() => removeOption(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addOption}>
                  Add Option
                </Button>
              </div>
            </div>
          )}

          {/* True/False */}
          {type === 'true/false' && (
            <div>
              <Label>Correct Answer *</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tf-answer-edit"
                    checked={correctAnswers.includes('True')}
                    onChange={() => setCorrectAnswers(['True'])}
                  />
                  True
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tf-answer-edit"
                    checked={correctAnswers.includes('False')}
                    onChange={() => setCorrectAnswers(['False'])}
                  />
                  False
                </label>
              </div>
            </div>
          )}

          {/* Text Answer */}
          {type === 'text' && (
            <div>
              <Label>Correct Answer Variants * (one per line)</Label>
              <Textarea
                value={correctAnswers.join('\n')}
                onChange={(e) =>
                  setCorrectAnswers(
                    e.target.value.split('\n').filter((v) => v.trim())
                  )
                }
                placeholder="e.g.&#10;Paris&#10;paris"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Multiple variants allow for flexible answers
              </p>
            </div>
          )}

          {/* Points */}
          <div>
            <Label htmlFor="edit-question-points">Points *</Label>
            <Input
              id="edit-question-points"
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              min={1}
            />
          </div>

          {/* Image Upload */}
          <div>
            <Label>Question Image (optional)</Label>
            <ImageUpload
              value={mediaUrl}
              onUpload={async (file) => {
                const result = await storageService.upload({
                  file,
                  bucket: 'quiz-media',
                  path: `questions/${quizId}/`,
                });
                setMediaUrl(result.url);
                return result.url;
              }}
              onRemove={() => setMediaUrl(null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
