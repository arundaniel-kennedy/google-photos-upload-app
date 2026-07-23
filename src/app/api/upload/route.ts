import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { insertPhoto, UPLOADS_DIR } from '@/lib/db';
import { config, ALLOWED_MIME_TYPES } from '@/lib/config';
import { assertSameOrigin, sanitizeName } from '@/lib/security';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';

// Public endpoint: anyone with the link may submit a photo for review. The
// submitter's typed name is used to group their photos in the admin portal.
export async function POST(request: Request) {
  try {
    assertSameOrigin();

    const formData = await request.formData();
    const file = formData.get('file');
    const uploaderName = sanitizeName(formData.get('name'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload an image.' },
        { status: 415 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (file.size > config.maxUploadBytes) {
      return NextResponse.json({ error: 'File is too large' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();
    const ext = path.extname(file.name).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    const storedName = `${id}${ext}`;

    // Stored outside /public; served only through the auth-gated image route.
    await fs.writeFile(path.join(UPLOADS_DIR, storedName), buffer);

    insertPhoto({
      id,
      storedName,
      originalName: file.name.slice(0, 255),
      mimeType: file.type,
      sizeBytes: file.size,
      uploaderName,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
