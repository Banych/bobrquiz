# Guide: Media Uploads (Images to Supabase Storage)

This guide covers how to upload quiz question images, store them in Supabase Storage, and display thumbnails in the admin interface.

## Overview

Media uploads allow admins to attach images to quiz questions. The flow:

1. **Client**: Select/drag image → Client-side resize (max 1920x1080, 85% quality)
2. **Upload**: POST to Supabase Storage `quiz-media` bucket
3. **Store**: Save public URL in Question `mediaUrl` field
4. **Display**: Thumbnail in question list, full image in edit dialog

---

## Supabase Storage Setup

### 1. Create Storage Bucket

Navigate to **Supabase Dashboard → Storage → Create Bucket**:

```
Bucket Name:       quiz-media
Public:            Yes (images need public access)
File Size Limit:   10 MB
Allowed MIME Types:
  - image/jpeg
  - image/png
  - image/webp
  - image/gif
```

### 2. Configure RLS Policies

Add these Row Level Security policies via **Storage → quiz-media → Policies**:

**Policy 1: Public Read Access**
```sql
CREATE POLICY "Public read access for quiz media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'quiz-media');
```

**Policy 2: Authenticated Upload** (further gated by middleware)
```sql
CREATE POLICY "Authenticated users can upload quiz media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quiz-media');
```

**Policy 3: Authenticated Delete** (further gated by middleware)
```sql
CREATE POLICY "Authenticated users can delete quiz media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quiz-media');
```

**Warning**: These allow any authenticated user to upload or delete, through the Storage API
directly. The admin check only guards the app's own pages and routes. They are safe only while
signups stay disabled in the Supabase project and every account is an admin. See
[the 2026-10-15 findings](../progress/findings/2026-10-15-storage-policies-any-user.md).

### 3. Verify Bucket Configuration

Test bucket is public:
```bash
curl https://<PROJECT_REF>.supabase.co/storage/v1/object/public/quiz-media/test.txt
# Should return 404 (not 403) if bucket is public
```

---

## Architecture

### Components

- **Storage Service** (`src/infrastructure/storage/`) – Upload/delete abstraction
- **Image Utils** (`src/lib/image-utils.ts`) – Client-side resizing
- **Upload Component** (`src/components/admin/image-upload.tsx`) – Drag-and-drop UI
- **Question Dialogs** – Integration in create/edit flows

### Data Flow

```
User selects image
  ↓
Client validates (type, size)
  ↓
Client resizes (1920x1080, 85% quality)
  ↓
POST multipart to API route
  ↓
Server calls StorageService.upload()
  ↓
Supabase Storage stores file
  ↓
Return public URL
  ↓
Save URL in Question entity mediaUrl field
  ↓
Display thumbnail in list
```

---

## Implementation

### 1. Storage Service Interface

```typescript
// src/infrastructure/storage/storage-service.ts

export interface IStorageService {
  upload(bucket: string, path: string, file: Buffer): Promise<string>;
  delete(bucket: string, path: string): Promise<void>;
  getPublicUrl(bucket: string, path: string): string;
}
```

### 2. Supabase Implementation

```typescript
// src/infrastructure/storage/supabase-storage.service.ts

import { createClient } from '@supabase/supabase-js';

export class SupabaseStorageService implements IStorageService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-side uploads
    );
  }

  async upload(bucket: string, path: string, file: Buffer): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    return this.getPublicUrl(bucket, data.path);
  }

  async delete(bucket: string, path: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) throw new Error(`Delete failed: ${error.message}`);
  }

  getPublicUrl(bucket: string, path: string): string {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  }
}
```

### 3. Image Resizing (Client-Side)

```typescript
// src/lib/image-utils.ts

export async function resizeImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.85
): Promise<{ blob: Blob; sizeKb: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate dimensions (preserve aspect ratio)
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert canvas to blob'));
              return;
            }
            const sizeKb = Math.round(blob.size / 1024);
            resolve({ blob, sizeKb });
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function validateImage(file: File): { valid: boolean; error?: string } {
  const maxSizeMb = 10;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Only JPEG, PNG, WebP, and GIF images allowed' };
  }

  if (file.size > maxSizeMb * 1024 * 1024) {
    return { valid: false, error: `Image must be smaller than ${maxSizeMb}MB` };
  }

  return { valid: true };
}
```

### 4. Upload Component

```typescript
// src/components/admin/image-upload.tsx

'use client';

import { useState } from 'react';
import { resizeImage, validateImage } from '@lib/image-utils';
import { Button } from '@ui/button';
import { X, Upload } from 'lucide-react';

interface ImageUploadProps {
  value?: string; // Current image URL
  onChange: (url: string | undefined) => void;
}

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | undefined>(value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    // 1. Validate
    const validation = validateImage(file);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 2. Resize client-side
      const originalSize = Math.round(file.size / 1024);
      const { blob, sizeKb } = await resizeImage(file);
      console.log(`📸 Image resized: ${originalSize}KB → ${sizeKb}KB (${Math.round((1 - sizeKb / originalSize) * 100)}% reduction)`);

      // 3. Create preview
      const previewUrl = URL.createObjectURL(blob);
      setPreview(previewUrl);

      // 4. Upload to server
      const formData = new FormData();
      formData.append('file', blob);

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const { url } = await res.json();
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPreview(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Drag-and-drop zone */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFileSelect(file);
        }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-lg p-4 text-center"
      >
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
          disabled={loading}
          hidden
          id="image-input"
        />
        <label htmlFor="image-input" className="cursor-pointer">
          <Upload className="mx-auto mb-2 h-6 w-6" />
          <p>Drag image or click to upload</p>
          <p className="text-xs text-gray-500">JPEG, PNG, WebP, GIF • Max 10MB</p>
        </label>
      </div>

      {/* Preview */}
      {preview && (
        <div className="relative w-full max-w-xs">
          <img src={preview} alt="Preview" className="rounded-lg" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPreview(undefined);
              onChange(undefined);
            }}
            className="absolute top-1 right-1"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Error message */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Loading state */}
      {loading && <p className="text-sm text-blue-500">Uploading...</p>}
    </div>
  );
}
```

### 5. API Upload Endpoint

```typescript
// src/app/api/admin/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';

export async function POST(req: NextRequest) {
  try {
    // Get file from FormData
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload via storage service
    const services = getServices();
    const url = await services.storageService.upload(
      'quiz-media',
      `${Date.now()}-${file.name}`,
      buffer
    );

    return NextResponse.json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

### 6. Integration in Create/Edit Dialogs

```typescript
// src/components/admin/create-question-dialog.tsx

import { ImageUpload } from './image-upload';
import { useForm } from 'react-hook-form';

export function CreateQuestionDialog() {
  const form = useForm({
    defaultValues: {
      mediaUrl: undefined,
    },
  });

  return (
    <Dialog>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* Other fields... */}
          <ImageUpload
            value={form.watch('mediaUrl')}
            onChange={(url) => form.setValue('mediaUrl', url)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 7. Display in Question List

```typescript
// src/components/admin/question-list.tsx

export function QuestionList({ questions }: { questions: QuestionDTO[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Question</th>
          <th>Type</th>
          <th>Media</th>
        </tr>
      </thead>
      <tbody>
        {questions.map((q) => (
          <tr key={q.id}>
            <td>{q.prompt}</td>
            <td>{q.type}</td>
            <td>
              {q.mediaUrl ? (
                <img src={q.mediaUrl} alt="Media" className="w-10 h-10 rounded" />
              ) : (
                <span className="text-gray-400">No media</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Database Schema

The Question model tracks media:

```prisma
model Question {
  id        String   @id @default(cuid())
  // ... other fields ...
  mediaUrl  String?
  mediaType String?  // "image" | "video" | etc.
  // ... more fields ...
}
```

Update via DTOs:

```typescript
// src/application/dtos/question.dto.ts

export const CreateQuestionDTO = z.object({
  // ... other fields ...
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
});
```

---

## Testing Media Upload

### Manual Testing via Playwright MCP

1. **Activate browser tools**:
   ```
   activate_browser_navigation_tools()
   activate_page_capture_tools()
   ```

2. **Navigate to admin**:
   ```
   mcp_microsoft_pla_browser_navigate('http://localhost:3000/admin/quizzes')
   ```

3. **Create question with image**:
   - Click "Create Question"
   - Fill in question details
   - Drag image into upload area
   - Observe client-side resize (console logs size reduction)
   - Click Save
   - Verify thumbnail appears in list

4. **Edit question**:
   - Click edit on a question
   - Verify existing image loads in upload area
   - Upload new image
   - Verify list updates

5. **Verify Supabase Storage**:
   - Supabase Dashboard → Storage → quiz-media
   - Confirm files are uploaded

### End-to-End Tests

```typescript
// e2e/admin-media-upload.spec.ts

import { test, expect } from '@playwright/test';

test('should upload image to question', async ({ page }) => {
  await page.goto('http://localhost:3000/admin/quizzes');
  // ... create quiz ...
  // ... open create question dialog ...

  // Upload image
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('test-image.png');

  // Wait for preview
  await expect(page.locator('img[alt="Preview"]')).toBeVisible();

  // Save
  await page.getByRole('button', { name: 'Save' }).click();

  // Verify thumbnail in list
  await expect(page.locator('img[alt="Media"]')).toBeVisible();
});
```

---

## File Size Optimization

The client-side resize dramatically reduces upload size:

| Original | Resized | Reduction |
| -------- | ------- | --------- |
| 26.6 KB  | 13.7 KB | 48%       |
| 95.2 KB  | 42.1 KB | 56%       |
| 150 KB   | 68 KB   | 55%       |

This saves bandwidth and Supabase storage costs.

---

## Troubleshooting

**"Access Denied when uploading"**
- Check RLS policies are set (see Setup section)
- Verify admin user email in `ADMIN_EMAILS`

**"Image doesn't display in list"**
- Check `mediaUrl` is saved in database (use Prisma Studio)
- Verify Supabase bucket is public
- Check CORS: Next.js should auto-handle, but check `next.config.ts` for `remotePatterns`

**"Upload times out"**
- Image might be too large; client resize should help
- Check network in dev tools (Network tab)
- Verify Supabase project is responsive (check status page)

---

## Related Documentation

- [guides/SETUP.md](SETUP.md) – Project setup and Next.js config
- [guides/PRESENTATION-LAYER.md](PRESENTATION-LAYER.md) – Form handling and components
- [guides/DATA-LAYER.md](DATA-LAYER.md) – Database schema for media
- [DECISION-LOG.md](../DECISION-LOG.md) – ADR-012 on Supabase Storage
