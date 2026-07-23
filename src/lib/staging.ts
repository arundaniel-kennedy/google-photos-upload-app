import path from 'path';
import fs from 'fs/promises';
import { getPhoto, markApproved, markRejected, UPLOADS_DIR, PhotoRecord } from './db';
import { uploadToGooglePhotos } from './google-photos';
import { BadRequestError, NotFoundError } from './errors';

/**
 * Push one staged photo to Google Photos and mark it approved. The caller
 * supplies a fresh admin access token so a batch of approvals reuses one token.
 * The local file is deleted only after Google confirms the upload.
 */
export async function approveStagedPhoto(
  photo: PhotoRecord,
  accessToken: string,
): Promise<string | null> {
  const filePath = path.join(UPLOADS_DIR, photo.stored_name);
  const fileBuffer = await fs.readFile(filePath);

  const mediaId = await uploadToGooglePhotos(
    fileBuffer,
    photo.original_name,
    photo.mime_type,
    accessToken,
  );

  markApproved(photo.id, mediaId);
  await fs.unlink(filePath).catch((e) => console.error('Cleanup error:', e));
  return mediaId;
}

/** Look up a pending photo by id or throw a typed error. */
export function loadPendingPhoto(id: string | undefined): PhotoRecord {
  if (!id) throw new BadRequestError('Missing photo id');
  const photo = getPhoto(id);
  if (!photo) throw new NotFoundError('Photo not found');
  if (photo.status !== 'pending') {
    throw new BadRequestError(`Photo is already ${photo.status}`);
  }
  return photo;
}

/** Reject one staged photo: mark it and remove the local file. */
export async function rejectStagedPhoto(photo: PhotoRecord) {
  markRejected(photo.id);
  await fs
    .unlink(path.join(UPLOADS_DIR, photo.stored_name))
    .catch((e) => console.error('Cleanup error:', e));
}
