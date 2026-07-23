import { AppError } from './errors';

const UPLOAD_URL = 'https://photoslibrary.googleapis.com/v1/uploads';
const BATCH_CREATE_URL =
  'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate';

interface BatchCreateResponse {
  newMediaItemResults?: Array<{
    status?: { code?: number; message?: string };
    mediaItem?: { id?: string };
  }>;
}

/**
 * Two-step Google Photos upload required by the photoslibrary.appendonly scope:
 * 1. Upload raw bytes to get an upload token.
 * 2. Create a media item from that token.
 */
export async function uploadToGooglePhotos(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  accessToken: string,
): Promise<string | null> {
  const uploadRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'X-Goog-Upload-Content-Type': mimeType,
      'X-Goog-Upload-File-Name': fileName,
      'X-Goog-Upload-Protocol': 'raw',
    },
    // Cast around the ArrayBufferLike generic mismatch between @types/node's
    // Buffer and the DOM lib's BodyInit; a Buffer is a valid fetch body at runtime.
    body: fileBuffer as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => '');
    throw new AppError(
      `Failed to upload bytes to Google Photos (${uploadRes.status}) ${detail}`.trim(),
      502,
    );
  }

  const uploadToken = (await uploadRes.text()).trim();
  if (!uploadToken) {
    throw new AppError('Google Photos returned an empty upload token', 502);
  }

  const createRes = await fetch(BATCH_CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      newMediaItems: [
        {
          description: 'Uploaded via Photo Drop',
          simpleMediaItem: { uploadToken, fileName },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '');
    throw new AppError(
      `Failed to create media item in Google Photos (${createRes.status}) ${detail}`.trim(),
      502,
    );
  }

  const data = (await createRes.json()) as BatchCreateResponse;
  const result = data.newMediaItemResults?.[0];
  // status.code 0 == OK. Any other code means the item was not created.
  if (result?.status && result.status.code && result.status.code !== 0) {
    throw new AppError(
      `Google Photos rejected the media item: ${result.status.message ?? 'unknown error'}`,
      502,
    );
  }

  return result?.mediaItem?.id ?? null;
}
