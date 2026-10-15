'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, X } from 'lucide-react';
import { ImageUpload } from '@components/admin/image-upload';
import { createStorageService } from '@infrastructure/storage/supabase-storage';
import type { CreateQuestionDTO } from '@application/dtos/question-admin.dto';

interface CreateQuestionDialogProps {
  quizId: string;
}

export function CreateQuestionDialog({ quizId }: CreateQuestionDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<'multiple-choice' | 'text' | 'true/false'>(
    'multiple-choice'
  );
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]);
  const [points, setPoints] = useState(10);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const storageService = createStorageService();

  const createMutation = useMutation({
    mutationFn: async (dto: CreateQuestionDTO) => {
      const response = await fetch(`/api/admin/quizzes/${quizId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create question');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', quizId] });
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] }); // Update question count
      setOpen(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setText('');
    setType('multiple-choice');
    setOptions(['', '', '', '']);
    setCorrectAnswers([]);
    setPoints(10);
    setMediaUrl(null);
  };

  const handleSubmit = () => {
    if (!text.trim()) {
      alert('Please enter a question');
      return;
    }

    if (correctAnswers.length === 0) {
      alert('Please select at least one correct answer');
      return;
    }

    const dto: CreateQuestionDTO = {
      quizId,
      text: text.trim(),
      type,
      options:
        type === 'multiple-choice' ? options.filter((o) => o.trim()) : [],
      correctAnswers,
      points,
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaUrl ? 'image' : undefined,
    };

    createMutation.mutate(dto);
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
    if (options.length <= 2) return; // Keep at least 2 options
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    // Remove from correct answers if selected
    setCorrectAnswers(correctAnswers.filter((ans) => ans !== options[index]));
  };

  const toggleCorrectAnswer = (option: string) => {
    if (correctAnswers.includes(option)) {
      setCorrectAnswers(correctAnswers.filter((ans) => ans !== option));
    } else {
      setCorrectAnswers([...correctAnswers, option]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Question
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Question</DialogTitle>
          <DialogDescription>
            Add a new question to your quiz. Answers are validated
            case-insensitively and trimmed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Question Text */}
          <div>
            <Label htmlFor="question-text">Question *</Label>
            <Textarea
              id="question-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your question..."
              rows={3}
            />
          </div>

          {/* Question Type */}
          <div>
            <Label htmlFor="question-type">Type *</Label>
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value as typeof type);
                setCorrectAnswers([]);
                if (value === 'true/false') {
                  setOptions(['True', 'False']);
                } else if (value === 'text') {
                  setOptions([]);
                }
              }}
            >
              <SelectTrigger id="question-type">
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
                    name="tf-answer"
                    checked={correctAnswers.includes('True')}
                    onChange={() => setCorrectAnswers(['True'])}
                  />
                  True
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tf-answer"
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
                Multiple variants allow for flexible answers (e.g., &quot;New
                York&quot;, &quot;NYC&quot;)
              </p>
            </div>
          )}

          {/* Points */}
          <div>
            <Label htmlFor="question-points">Points *</Label>
            <Input
              id="question-points"
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
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
