# Media Uploads - Supabase Storage Setup

## Overview
Media upload functionality allows admins to attach images to quiz questions. Images are stored in Supabase Storage with client-side resizing before upload to reduce bandwidth and storage costs.

## Architecture

### Components
- **Storage Service** (`src/infrastructure/storage/`) - Abstraction for file uploads
- **Image Utils** (`src/lib/image-utils.ts`) - Client-side resizing and validation
- **Image Upload Component** (`src/components/admin/image-upload.tsx`) - UI with drag-and-drop
- **Question Dialogs** - Integration in create/edit dialogs

### Flow
1. User selects/drops image file
2. Client validates type and size (max 10MB)
3. Client resizes to max 1920x1080 @ 85% quality
4. Upload to Supabase Storage `quiz-media` bucket
5. Store public URL in Question entity `mediaUrl` field
6. Display thumbnails in QuestionList table

## Supabase Storage Setup

### 1. Create Storage Bucket

Navigate to Supabase Dashboard → Storage → Create Bucket:

```
Bucket Name: quiz-media
Public: Yes (images need to be publicly accessible)
File Size Limit: 10 MB
Allowed MIME Types: image/jpeg, image/png, image/webp, image/gif
```

### 2. Configure RLS Policies

Apply these Row Level Security policies to the `quiz-media` bucket:

**Policy 1: Public Read Access** added manually via SQL Editor
```sql
CREATE POLICY "Public read access for quiz media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'quiz-media');
```

**Policy 2: Authenticated Upload** added manually via SQL Editor
```sql
CREATE POLICY "Authenticated users can upload quiz media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quiz-media');
```

**Policy 3: Authenticated Delete (Simplified)** added manually via SQL Editor
```sql
CREATE POLICY "Authenticated users can delete quiz media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quiz-media');
```

**Note**: This allows any authenticated user to delete files. Since admin routes are protected by middleware (checking `ADMIN_EMAILS`), only admins can reach the delete functionality. For stricter database-level control, implement server-side delete endpoint that validates admin status before calling storage service.

### 3. Verify Bucket Configuration

Test bucket access:
```bash
curl https://<PROJECT_REF>.supabase.co/storage/v1/object/public/quiz-media/test.txt
# Should return 404 (not 403) if bucket is public
```

## Usage

### Creating Questions with Images

1. Navigate to Admin → Quizzes → Select Quiz → Create Question
2. Fill in question details
3. Click or drag image into the upload area
4. Image automatically resizes and uploads
5. Preview appears with remove button
6. Save question (includes `mediaUrl` and `mediaType: 'image'`)

### Editing Questions

1. Click edit button on any question
2. Existing image (if any) displays in upload area
3. Click X to remove image or upload new one
4. New upload replaces previous image URL (old file persists in storage)

### Viewing Questions

- QuestionList table shows 40x40px thumbnails in "Media" column
- Empty state shows placeholder icon for questions without images
- Full image displays when editing/viewing question

## Technical Details

### Client-Side Resizing

Images are resized using the HTML Canvas API before upload:

```typescript
// Default resize options
{
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  mimeType: 'image/jpeg'
}
```

**Benefits**:
- Reduces upload bandwidth (typically 70-90% size reduction)
- Faster uploads
- Lower storage costs
- No server-side processing needed

**Example**: 5MB JPEG → ~500KB after resize

### Storage Paths

Files are organized by quiz:
```
quiz-media/
  questions/
    {quizId}/
      {timestamp}-{random}.{ext}
```

Example: `quiz-media/questions/cm4abc123/1703097600000-a1b2c3d4e5.jpg`

### Supported Formats

- **JPEG** (`.jpg`, `.jpeg`) - Recommended for photos
- **PNG** (`.png`) - Supports transparency
- **WebP** (`.webp`) - Modern format with better compression
- **GIF** (`.gif`) - Animated images (not optimized)

### File Size Limits

- **Pre-resize**: 10 MB (enforced by component)
- **Post-resize**: Typically < 1 MB
- **Supabase bucket**: 10 MB limit

## DTOs and Schema

### Question Entity
```typescript
class Question {
  media?: string;           // Public URL
  mediaType?: 'image' | 'video' | 'audio';
  // ... other fields
}
```

### CreateQuestionDTO
```typescript
{
  // ... other fields
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | null;
}
```

### Database Schema
```prisma
model Question {
  mediaUrl   String?
  mediaType  QuestionMediaType?
  // ... other fields
}

enum QuestionMediaType {
  image
  video
  audio
}
```

## Future Enhancements (Deferred to R6)

### Image Optimization
- WebP conversion for better compression
- Multiple sizes (thumbnail, medium, full)
- Lazy loading with blur placeholder
- CDN integration (Cloudinary/Imgix)

### Advanced Features
- Image cropping tool
- Filters and adjustments
- Batch upload
- Media library (reuse images across questions)
- Video/audio support

### Storage Management
- Automatic cleanup of unused media
- Storage usage dashboard
- Compression settings per quiz
- Direct S3/R2 integration option

## Troubleshooting

### Upload Fails with "Failed to upload file"

**Check**:
1. Supabase Storage bucket exists and is public
2. RLS policies are correctly configured
3. User is authenticated (check browser dev tools → Network)
4. File size under 10MB
5. Valid image format (JPEG/PNG/WebP/GIF)

### Images Don't Display in QuestionList

**Check**:
1. Public URL is stored correctly in database
2. Bucket has public read access
3. CORS configured in Supabase (usually auto-configured)
4. Browser console for CORS/403 errors

### Resizing Takes Too Long

**Possible causes**:
- Very large source images (> 20MB)
- Old/slow device
- Complex GIF animations

**Solutions**:
- Add loading indicator (already implemented)
- Reduce max dimensions or quality
- Limit source file size further

### Storage Quota Exceeded

**Check Supabase dashboard**:
- Project Settings → Usage → Storage
- Free tier: 1 GB
- Pro tier: 100 GB + $0.021/GB

**Solutions**:
- Delete unused media via Supabase dashboard
- Implement automatic cleanup (future enhancement)
- Upgrade plan

## API Reference

### IStorageService

```typescript
interface IStorageService {
  upload(options: UploadOptions): Promise<UploadResult>;
  delete(options: DeleteOptions): Promise<void>;
  getPublicUrl(bucket: string, path: string): string;
}
```

### Image Utils

```typescript
// Resize image before upload
resizeImage(file: File, options?: ResizeOptions): Promise<File>

// Validate image type
isValidImageType(file: File): boolean

// Validate image size
isValidImageSize(file: File, maxSizeMB?: number): boolean

// Format file size for display
formatFileSize(bytes: number): string
```

### ImageUpload Component

```typescript
<ImageUpload
  value={imageUrl}              // Current URL
  onUpload={handleUpload}       // (file: File) => Promise<string>
  onRemove={handleRemove}       // () => void
  disabled={false}              // Disable upload
  maxSizeMB={10}               // Max file size
/>
```

## Testing

### Manual Testing Checklist

- [ ] Create question with image
- [ ] Edit question and replace image
- [ ] Remove image from question
- [ ] Create question without image (optional field)
- [ ] Upload large image (verify resizing)
- [ ] Upload invalid file type (verify error)
- [ ] Upload oversized file (verify error)
- [ ] Verify thumbnail in QuestionList
- [ ] Verify full image in edit dialog
- [ ] Test drag-and-drop upload
- [ ] Test click-to-upload

### E2E Tests (Deferred)

E2E tests for image upload require:
1. Mock file upload in Playwright
2. Test Supabase Storage access
3. Verify image persistence across sessions

See: `docs/progress/actions/05-testing-improvements.md`

## Security Considerations

### Current Implementation
✅ Public read access (images visible to all)
✅ Authenticated upload only (admin users)
✅ Client-side file type validation
✅ File size limits (10 MB)
✅ Unique filenames prevent overwrites

### Production Recommendations
🔒 **Implement server-side validation** - Verify file types server-side
🔒 **Add malware scanning** - Use Supabase extensions or third-party service
🔒 **Rate limiting** - Prevent abuse of upload endpoint
🔒 **Content moderation** - Review uploaded images (manual or automated)
🔒 **HTTPS only** - Enforce secure connections (already via Supabase)

## Monitoring

### Metrics to Track
- Upload success rate
- Average upload time
- Storage usage growth
- Failed uploads (by error type)
- Popular image formats
- Average file sizes (pre/post resize)

### Logs
- Upload errors logged to console (dev)
- Future: Structured logging to observability platform

## References

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [HTML Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Image Optimization Best Practices](https://web.dev/fast/)
- Storage service: `src/infrastructure/storage/supabase-storage.ts`
- Image utils: `src/lib/image-utils.ts`
- Upload component: `src/components/admin/image-upload.tsx`
