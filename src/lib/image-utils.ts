/**
 * Client-side image resizing and compression utilities
 * Uses browser Canvas API to reduce image sizes before upload
 */

import {
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_UPLOAD_BYTES,
} from '@application/dtos/media.dto';

export interface ResizeOptions {
  /**
   * Maximum width in pixels
   */
  maxWidth?: number;

  /**
   * Maximum height in pixels
   */
  maxHeight?: number;

  /**
   * Output quality (0-1)
   */
  quality?: number;

  /**
   * Output MIME type (default: image/jpeg)
   */
  mimeType?: string;
}

const DEFAULT_OPTIONS: Required<ResizeOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  mimeType: 'image/jpeg',
};

/**
 * Resize and compress an image file
 */
export const resizeImage = async (
  file: File,
  options: ResizeOptions = {}
): Promise<File> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img;

          if (width > opts.maxWidth || height > opts.maxHeight) {
            const widthRatio = opts.maxWidth / width;
            const heightRatio = opts.maxHeight / height;
            const ratio = Math.min(widthRatio, heightRatio);

            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          // Create canvas and draw resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob from canvas'));
                return;
              }

              // Create new File from blob
              const resizedFile = new File([blob], file.name, {
                type: opts.mimeType,
                lastModified: Date.now(),
              });

              resolve(resizedFile);
            },
            opts.mimeType,
            opts.quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Validate image file type
 */
export const isValidImageType = (file: File): boolean =>
  (MEDIA_ALLOWED_TYPES as readonly string[]).includes(file.type);

/** Whether a (resized) image fits the server's upload limit. */
export const isWithinUploadLimit = (file: Blob): boolean =>
  file.size <= MEDIA_MAX_UPLOAD_BYTES;

/**
 * Validate image file size (in bytes)
 */
export const isValidImageSize = (
  file: File,
  maxSizeMB: number = 10
): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};
