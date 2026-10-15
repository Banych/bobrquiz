/**
 * Image Upload Component
 * Drag-and-drop or click to upload with preview, validation, and client-side resizing
 */

'use client';

import { useCallback, useState, useEffect } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@ui/button';
import {
  resizeImage,
  isValidImageType,
  isValidImageSize,
  formatFileSize,
} from '@/lib/image-utils';
import { cn } from '@/lib/utils';

export interface ImageUploadProps {
  /**
   * Current image URL (if exists)
   */
  value?: string | null;

  /**
   * Callback when image is uploaded
   */
  onUpload: (file: File) => Promise<string>;

  /**
   * Callback when image is removed
   */
  onRemove?: () => void;

  /**
   * Whether upload is disabled
   */
  disabled?: boolean;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Max file size in MB
   */
  maxSizeMB?: number;
}

export function ImageUpload({
  value,
  onUpload,
  onRemove,
  disabled = false,
  className,
  maxSizeMB = 10,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(value || null);

  // Sync preview with value prop changes (for edit dialog)
  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      // Validate file type
      if (!isValidImageType(file)) {
        setError(
          'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.'
        );
        return;
      }

      // Validate file size
      if (!isValidImageSize(file, maxSizeMB)) {
        setError(`File size exceeds ${maxSizeMB}MB limit.`);
        return;
      }

      try {
        setIsUploading(true);

        // Resize image before upload
        const resizedFile = await resizeImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.85,
        });

        console.log(
          `Resized image from ${formatFileSize(file.size)} to ${formatFileSize(resizedFile.size)}`
        );

        // Upload and get URL
        const url = await onUpload(resizedFile);

        // Set preview
        setPreview(url);
      } catch (err) {
        console.error('Upload error:', err);
        setError(err instanceof Error ? err.message : 'Failed to upload image');
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload, maxSizeMB]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [disabled, isUploading, handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (disabled || isUploading) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFile(file);
      }
    };
    input.click();
  }, [disabled, isUploading, handleFile]);

  const handleRemove = useCallback(() => {
    setPreview(null);
    setError(null);
    onRemove?.();
  }, [onRemove]);

  return (
    <div className={cn('space-y-2', className)}>
      {preview ? (
        <div className="relative rounded-lg border border-border overflow-hidden bg-muted">
          <div className="relative aspect-video w-full">
            <Image
              src={preview}
              alt="Uploaded image"
              fill
              className="object-contain"
            />
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              aria-label="Remove image"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'relative rounded-lg border-2 border-dashed transition-colors',
            'flex flex-col items-center justify-center gap-2 p-8',
            'cursor-pointer hover:border-primary hover:bg-muted/50',
            isDragging && 'border-primary bg-muted',
            disabled && 'cursor-not-allowed opacity-50',
            error && 'border-destructive'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : (
            <>
              <div className="rounded-full bg-muted p-3">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPEG, PNG, WebP, or GIF (max {maxSizeMB}MB)
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
