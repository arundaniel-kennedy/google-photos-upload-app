import { headers } from 'next/headers';
import { BadRequestError, ForbiddenError } from './errors';
import { config, MAX_NAME_LENGTH } from './config';

/**
 * Reject state-changing requests that don't originate from our own site.
 * Combined with SameSite=Lax session cookies this closes the CSRF gap without
 * a token round-trip.
 *
 * We compare the request's Origin (or Referer) host against every host the app
 * is legitimately reachable at. Behind a reverse proxy the browser's Origin is
 * the public domain while the app's own Host header may be an internal name, so
 * we also trust X-Forwarded-Host and any TRUSTED_ORIGINS from config.
 */
export function assertSameOrigin() {
  const h = headers();
  const origin = h.get('origin');
  // Some same-origin navigations omit Origin; fall back to Referer.
  const referer = h.get('referer');

  const source = origin ?? referer;
  // No Origin/Referer at all is treated as cross-site for mutating endpoints.
  if (!source) throw new ForbiddenError('Missing origin');

  let sourceHost: string;
  try {
    sourceHost = new URL(source).host.toLowerCase();
  } catch {
    throw new ForbiddenError('Invalid origin');
  }

  const allowed = new Set(
    [
      h.get('host'),
      // May be a comma-separated list if the request passed through proxies.
      ...(h.get('x-forwarded-host') ?? '').split(','),
      ...config.trustedOrigins,
    ]
      .map((v) => v?.trim().toLowerCase())
      .filter((v): v is string => Boolean(v)),
  );

  if (!allowed.has(sourceHost)) {
    throw new ForbiddenError('Cross-origin request rejected');
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Normalize an uploader-supplied display name: strip control characters,
 * collapse whitespace, and bound the length. React escapes the value on
 * render, so this is about hygiene and storage bounds, not HTML safety.
 */
export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new BadRequestError('Name is required');
  }
  const cleaned = input
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (cleaned.length === 0) {
    throw new BadRequestError('Name is required');
  }
  return cleaned;
}
