import { NextResponse } from 'next/server';
import { requireAdmin, getAdminAccessToken } from '@/lib/auth';
import { assertSameOrigin, sanitizeName } from '@/lib/security';
import { getPendingByUploader } from '@/lib/db';
import { approveStagedPhoto } from '@/lib/staging';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
// Approving a whole person's batch can take a while (one Google upload each).
export const maxDuration = 300;

// Approve every pending photo attributed to one uploader. Photos are pushed
// sequentially so only a single file is held in memory at a time.
export async function POST(request: Request) {
  try {
    assertSameOrigin();
    requireAdmin();

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const uploaderName = sanitizeName(body?.name);

    const photos = getPendingByUploader(uploaderName);
    if (photos.length === 0) {
      return NextResponse.json({ success: true, approved: 0, failed: 0 });
    }

    const accessToken = await getAdminAccessToken();

    let approved = 0;
    const failed: string[] = [];
    for (const photo of photos) {
      try {
        await approveStagedPhoto(photo, accessToken);
        approved += 1;
      } catch (e) {
        console.error(`Failed to approve ${photo.id}:`, e);
        failed.push(photo.id);
      }
    }

    return NextResponse.json({ success: true, approved, failed: failed.length });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    if (status >= 500) console.error('Approve-all error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status },
    );
  }
}
