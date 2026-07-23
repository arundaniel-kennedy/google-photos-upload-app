import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { loadPendingPhoto, rejectStagedPhoto } from '@/lib/staging';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin();
    requireAdmin();

    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    const photo = loadPendingPhoto(body?.id);
    await rejectStagedPhoto(photo);

    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    if (status >= 500) console.error('Reject error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status },
    );
  }
}
