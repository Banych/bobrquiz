'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MediaUploadResultDTO,
  OwnerMediaFileDTO,
} from '@application/dtos/media.dto';

/** Query key for the signed-in host's media library. */
export const ownerMediaQueryKey = () => ['admin', 'media'] as const;

const readError = async (response: Response, fallback: string) => {
  const { error } = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return new Error(error ?? fallback);
};

/** Lists the files of every quiz the signed-in host owns, newest first. */
export const fetchOwnerMedia = async (): Promise<OwnerMediaFileDTO[]> => {
  const response = await fetch('/api/admin/media', { cache: 'no-store' });
  if (!response.ok) {
    throw await readError(response, 'Unable to load media.');
  }
  return (await response.json()) as OwnerMediaFileDTO[];
};

/**
 * Uploads one question image into the quiz's folder. The server checks the
 * owner, the image type, the 4 MB limit and the host's media cap; any refusal
 * throws with the server's message.
 */
export const uploadQuizMedia = async (
  quizId: string,
  file: File
): Promise<MediaUploadResultDTO> => {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/media`,
    { method: 'POST', body }
  );
  if (!response.ok) {
    throw await readError(response, 'Unable to upload image.');
  }
  return (await response.json()) as MediaUploadResultDTO;
};

/** Deletes one file from the quiz's folder. */
export const deleteQuizMedia = async (
  quizId: string,
  fileName: string
): Promise<void> => {
  const response = await fetch(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/media/${encodeURIComponent(fileName)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw await readError(response, 'Unable to delete image.');
  }
};

/**
 * The host's media library. No refetch interval: every load lists one storage
 * folder per quiz the host owns (the parked media cap fan-out item), and the
 * list changes only through this browser's own uploads and deletes, which
 * invalidate it.
 */
export function useOwnerMedia() {
  return useQuery({
    queryKey: ownerMediaQueryKey(),
    queryFn: fetchOwnerMedia,
    staleTime: 5_000,
  });
}

export function useUploadQuizMedia(quizId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadQuizMedia(quizId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ownerMediaQueryKey() });
    },
  });
}

export function useDeleteQuizMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, fileName }: { quizId: string; fileName: string }) =>
      deleteQuizMedia(quizId, fileName),
    // Settled, not success: a 404 for a file already deleted elsewhere must
    // still drop its card from the list.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ownerMediaQueryKey() });
    },
  });
}
