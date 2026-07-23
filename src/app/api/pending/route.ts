import { NextResponse } from 'next/server';
import { getPendingPhotos } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    requireAdmin();
    const photos = getPendingPhotos().map((p) => ({
      id: p.id,
      originalName: p.original_name,
      uploaderName: p.uploader_name,
      sizeBytes: p.size_bytes,
      uploadedAt: p.uploaded_at,
    }));
    return NextResponse.json({ photos });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status },
    );
  }
}
