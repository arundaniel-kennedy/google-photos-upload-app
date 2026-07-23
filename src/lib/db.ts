import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// better-sqlite3 is synchronous, which is a good fit for short-lived API route handlers.
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const UPLOADS_DIR = path.join(dataDir, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new Database(path.join(dataDir, 'photos.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_photos (
    id TEXT PRIMARY KEY,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploader_name TEXT NOT NULL DEFAULT 'Anonymous',
    status TEXT NOT NULL DEFAULT 'pending',
    google_media_id TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );

  CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_photos(status, uploader_name);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );

  -- Per-account OAuth token store (admin pushes with theirs; users read theirs).
  CREATE TABLE IF NOT EXISTS google_tokens (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    access_token TEXT,
    refresh_token TEXT NOT NULL,
    expiry_date INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export type PhotoStatus = 'pending' | 'approved' | 'rejected';

export interface PhotoRecord {
  id: string;
  stored_name: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploader_name: string;
  status: PhotoStatus;
  google_media_id: string | null;
  uploaded_at: string;
  resolved_at: string | null;
}

export function insertPhoto(record: {
  id: string;
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderName: string;
}) {
  return db
    .prepare(
      `INSERT INTO pending_photos
        (id, stored_name, original_name, mime_type, size_bytes, uploader_name)
       VALUES (@id, @storedName, @originalName, @mimeType, @sizeBytes, @uploaderName)`,
    )
    .run(record);
}

export function getPendingPhotos(): PhotoRecord[] {
  return db
    .prepare(
      `SELECT * FROM pending_photos
       WHERE status = 'pending'
       ORDER BY uploader_name COLLATE NOCASE ASC, uploaded_at DESC`,
    )
    .all() as PhotoRecord[];
}

export function getPendingByUploader(uploaderName: string): PhotoRecord[] {
  return db
    .prepare(
      "SELECT * FROM pending_photos WHERE status = 'pending' AND uploader_name = ? ORDER BY uploaded_at DESC",
    )
    .all(uploaderName) as PhotoRecord[];
}

export function getPhoto(id: string): PhotoRecord | undefined {
  return db.prepare('SELECT * FROM pending_photos WHERE id = ?').get(id) as
    | PhotoRecord
    | undefined;
}

export function markApproved(id: string, googleMediaId: string | null) {
  return db
    .prepare(
      `UPDATE pending_photos
       SET status = 'approved', google_media_id = ?, resolved_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
    )
    .run(googleMediaId, id);
}

export function markRejected(id: string) {
  return db
    .prepare(
      `UPDATE pending_photos
       SET status = 'rejected', resolved_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
    )
    .run(id);
}

// --- Sessions ---

export interface SessionRecord {
  id: string;
  email: string;
  name: string;
}

export function createSession(
  id: string,
  email: string,
  name: string,
  expiresAt: Date,
) {
  return db
    .prepare(
      'INSERT INTO sessions (id, email, name, expires_at) VALUES (?, ?, ?, ?)',
    )
    .run(id, email, name, expiresAt.toISOString());
}

export function getValidSession(id: string): SessionRecord | undefined {
  return db
    .prepare(
      "SELECT id, email, name FROM sessions WHERE id = ? AND expires_at > datetime('now')",
    )
    .get(id) as SessionRecord | undefined;
}

export function deleteSession(id: string) {
  return db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// --- Google tokens (per account) ---

export interface GoogleTokenRecord {
  email: string;
  name: string;
  access_token: string | null;
  refresh_token: string;
  expiry_date: number | null;
}

export function upsertGoogleTokens(record: GoogleTokenRecord) {
  return db
    .prepare(
      `INSERT INTO google_tokens (email, name, access_token, refresh_token, expiry_date, updated_at)
       VALUES (@email, @name, @access_token, @refresh_token, @expiry_date, CURRENT_TIMESTAMP)
       ON CONFLICT(email) DO UPDATE SET
         name = excluded.name,
         access_token = excluded.access_token,
         -- Google only returns a refresh_token on first consent; keep the old one otherwise.
         refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
         expiry_date = excluded.expiry_date,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(record);
}

export function getGoogleTokens(email: string): GoogleTokenRecord | undefined {
  return db.prepare('SELECT * FROM google_tokens WHERE email = ?').get(email) as
    | GoogleTokenRecord
    | undefined;
}

export default db;
