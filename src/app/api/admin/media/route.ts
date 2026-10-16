import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getServices } from '@application/services/factories';
import {
  DeleteMediaInputSchema,
  UploadMediaInputSchema,
} from '@application/dtos/media.dto';

export const dynamic = 'force-dynamic';

const NO_FILE_MESSAGE = 'No image file provided';
const INVALID_PATH_MESSAGE = 'Invalid media path';

const toErrorResponse = (error: unknown, method: string, fallback: string) => {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? fallback },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    if (error.name === 'MediaValidationError') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (/not found/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
  }

  console.error(`[API] ${method} media error:`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
};

export async function POST(request: Request) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: NO_FILE_MESSAGE }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: NO_FILE_MESSAGE }, { status: 400 });
    }

    const quizId = form.get('quizId');
    const { quizId: validQuizId } = UploadMediaInputSchema.parse({
      quizId: typeof quizId === 'string' ? quizId : undefined,
    });

    const result = await getServices().mediaService.upload({
      quizId: validQuizId,
      file: {
        bytes: await file.arrayBuffer(),
        contentType: file.type,
        size: file.size,
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, 'POST', 'Unable to upload image');
  }
}

export async function GET() {
  try {
    return NextResponse.json(await getServices().mediaService.list());
  } catch (error) {
    return toErrorResponse(error, 'GET', 'Unable to load media');
  }
}

export async function DELETE(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: INVALID_PATH_MESSAGE },
        { status: 400 }
      );
    }

    const input = DeleteMediaInputSchema.parse(body);
    await getServices().mediaService.delete(input);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error, 'DELETE', 'Unable to delete image');
  }
}
