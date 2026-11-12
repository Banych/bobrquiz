'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@ui/button';
import { formatFileSize } from '@lib/image-utils';
import { useDeleteQuizMedia, useOwnerMedia } from '@hooks/use-quiz-media';
import type { OwnerMediaFileDTO } from '@application/dtos/media.dto';

export function MediaLibrary() {
  const { data: files, isLoading, error } = useOwnerMedia();
  const deleteMedia = useDeleteQuizMedia();

  const handleDelete = (file: OwnerMediaFileDTO) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    deleteMedia.mutate({ quizId: file.quizId, fileName: file.name });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Loading media...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-sm text-destructive">
        Failed to load media. Please try again.
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No media files found. Upload images when creating or editing questions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deleteMedia.error && (
        <p role="alert" className="text-sm text-destructive">
          {deleteMedia.error.message}
        </p>
      )}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {files.map((file) => (
          <div
            key={file.path}
            className="group relative rounded-lg border bg-card overflow-hidden"
          >
            <div className="aspect-square bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={file.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-medium" title={file.name}>
                {file.name}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={file.quizTitle}
              >
                {file.quizTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              title="Delete"
              aria-label={`Delete ${file.name}`}
              disabled={deleteMedia.isPending}
              onClick={() => handleDelete(file)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
