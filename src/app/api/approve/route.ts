import { NextResponse } from 'next/server';
import { requireAdmin, getAdminAccessToken } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/security';
import { approveStagedPhoto, loadPendingPhoto } from '@/lib/staging';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin();
    requireAdmin();

    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    const photo = loadPendingPhoto(body?.id);

    // Token comes from the server-side admin OAuth store, never from the client.
    const accessToken = await getAdminAccessToken();
    const googleMediaId = await approveStagedPhoto(photo, accessToken);

    return NextResponse.json({ success: true, googleMediaId });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    if (status >= 500) console.error('Approval error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status },
    );
  }
}
