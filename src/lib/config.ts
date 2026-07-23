function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  google: {
    get clientId() {
      return required('GOOGLE_CLIENT_ID');
    },
    get clientSecret() {
      return required('GOOGLE_CLIENT_SECRET');
    },
    get redirectUri() {
      return required('GOOGLE_REDIRECT_URI');
    },
  },
  get adminEmail() {
    return required('ADMIN_EMAIL').toLowerCase();
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // Extra hostnames that count as "same origin" for CSRF checks, for when the
  // app runs behind a reverse proxy / custom domain (comma-separated, e.g.
  // "photos.example.com,192.168.1.50:3001"). The request's own Host and
  // X-Forwarded-Host are always trusted; this is only needed if the proxy
  // rewrites Host to something the browser's Origin won't match.
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

export const OAUTH_SCOPES = [
  'openid',
  'email',
  // appendonly: the admin pushes approved photos into their own library.
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
];

export const MAX_NAME_LENGTH = 60;

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const SESSION_COOKIE = 'gpp_session';
export const OAUTH_STATE_COOKIE = 'gpp_oauth_state';
