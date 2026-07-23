import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getPhoto, UPLOADS_DIR } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auth-gated preview of a staged upload. The image bytes never live under /public.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // Staged previews are only visible to the admin reviewing them.
  if (!getCurrentUser()?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const photo = getPhoto(params.id);
  if (!photo || photo.status !== 'pending') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    // stored_name is a server-generated UUID + sanitized extension, so it
    // cannot escape UPLOADS_DIR.
    const data = await fs.readFile(path.join(UPLOADS_DIR, photo.stored_name));
    return new NextResponse(data, {
      headers: {
        'Content-Type': photo.mime_type,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 });
  }
}
